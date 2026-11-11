#!/usr/bin/env bash
set -euo pipefail

# Create one WireGuard client profile on the VPS. Protect the output file:
# it contains the client's private key.
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash add-peer.sh <client-name> <server-public-ip-or-dns>" >&2
  exit 1
fi
if [[ $# -ne 2 ]]; then
  echo "Usage: sudo bash add-peer.sh <client-name> <server-public-ip-or-dns>" >&2
  exit 1
fi
NAME="$1"
ENDPOINT="$2"
if [[ ! "${NAME}" =~ ^[a-zA-Z0-9_-]{1,32}$ ]]; then
  echo "Client name may contain only letters, numbers, underscore and hyphen." >&2
  exit 1
fi
if [[ ! -s /etc/wireguard/server_private.key || ! -s /etc/wireguard/server_public.key ]]; then
  echo "Run setup-wireguard.sh first." >&2
  exit 1
fi
if ! systemctl is-active --quiet wg-quick@wg0; then
  echo "wg0 is not running." >&2
  exit 1
fi

OUT_DIR="/root/kem-vpn-clients"
install -d -m 700 "${OUT_DIR}"
PROFILE="${OUT_DIR}/${NAME}.conf"
if [[ -e "${PROFILE}" ]]; then
  echo "A profile named ${NAME} already exists; choose another name." >&2
  exit 1
fi

# Allocate the first unused address from 10.66.66.2 through 10.66.66.254.
USED="$(wg show wg0 allowed-ips | awk '{print $2}' | tr ',' '\n' | sed -n 's#^10\.66\.66\.\([0-9]*\)/32$#\1#p' | sort -n)"
CLIENT_OCTET=""
for n in $(seq 2 254); do
  if ! grep -qx "${n}" <<< "${USED}"; then CLIENT_OCTET="${n}"; break; fi
done
if [[ -z "${CLIENT_OCTET}" ]]; then
  echo "No free client addresses remain in 10.66.66.0/24." >&2
  exit 1
fi

CLIENT_PRIVATE="$(wg genkey)"
CLIENT_PUBLIC="$(printf '%s' "${CLIENT_PRIVATE}" | wg pubkey)"
SERVER_PUBLIC="$(cat /etc/wireguard/server_public.key)"
CLIENT_IP="10.66.66.${CLIENT_OCTET}"

wg set wg0 peer "${CLIENT_PUBLIC}" allowed-ips "${CLIENT_IP}/32"
wg-quick save wg0

cat > "${PROFILE}" <<EOF
[Interface]
PrivateKey = ${CLIENT_PRIVATE}
Address = ${CLIENT_IP}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUBLIC}
Endpoint = ${ENDPOINT}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
chmod 600 "${PROFILE}"
unset CLIENT_PRIVATE

echo "Client profile created at: ${PROFILE}"
echo "Import this file into KEM VPN. It contains a secret private key; transfer it securely and never upload it to GitHub."
