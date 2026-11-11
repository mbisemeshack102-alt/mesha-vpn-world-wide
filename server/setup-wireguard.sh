#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 22.04/24.04 WireGuard exit-server bootstrap.
# Run on a fresh VPS as root. Never commit generated keys/configs to GitHub.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash setup-wireguard.sh" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script currently supports Ubuntu/Debian with apt." >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard iptables

WAN_IF="$(ip -o -4 route show to default | awk '{print $5; exit}')"
if [[ -z "${WAN_IF}" ]]; then
  echo "Could not detect the VPS internet interface." >&2
  exit 1
fi

install -d -m 700 /etc/wireguard
umask 077
if [[ ! -s /etc/wireguard/server_private.key ]]; then
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi

cat > /etc/sysctl.d/99-kem-vpn-forwarding.conf <<'SYSCTL'
net.ipv4.ip_forward=1
SYSCTL
sysctl --system >/dev/null

SERVER_PRIVATE_KEY="$(cat /etc/wireguard/server_private.key)"
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = ${SERVER_PRIVATE_KEY}
PostUp = iptables -t nat -A POSTROUTING -o ${WAN_IF} -j MASQUERADE; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o ${WAN_IF} -j MASQUERADE; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT
EOF
chmod 600 /etc/wireguard/wg0.conf /etc/wireguard/server_private.key

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 51820/udp
fi

systemctl enable --now wg-quick@wg0
echo
echo "KEM VPN WireGuard server is running."
echo "VPS public key:"
cat /etc/wireguard/server_public.key
echo
echo "Open UDP port 51820 in your VPS provider firewall/security group."
echo "Server tunnel address: 10.66.66.1/24"
echo "Detected internet interface: ${WAN_IF}"
echo "Next: run add-peer.sh with a unique client name and the VPS public IP/DNS."
