# KEM VPN

KEM VPN is an Android WireGuard client plus a starter VPS deployment path.

## Android client status

- Kotlin Android app
- Embedded official WireGuard tunnel library
- Paste a client WireGuard profile
- Android VPN permission prompt
- Connect and disconnect actions
- GitHub Actions debug APK build

The client can establish a real WireGuard tunnel **only after** a working server is deployed and a valid client profile is issued. The APK does not create internet access on its own.

## Build APK

Open the Actions tab and select **Build KEM VPN APK**. After the workflow succeeds, open its run and download the `kem-vpn-debug-apk` artifact. It contains `app-debug.apk`.

You can also build locally with JDK 17 and Gradle 8.9 using `gradle assembleDebug`.

## Deploy a starter WireGuard exit server

Use a fresh Ubuntu 22.04/24.04 VPS with a public IPv4 address. This VPS is the VPN exit point, so client traffic exits through the VPS internet connection.

1. SSH into the VPS.
2. Copy `server/setup-wireguard.sh` to the VPS and run `sudo bash setup-wireguard.sh`.
3. Allow inbound UDP port 51820 in the VPS provider firewall/security group.
4. Copy `server/add-peer.sh` to the VPS.
5. Run `sudo bash add-peer.sh phone1 YOUR_VPS_PUBLIC_IP`.
6. Transfer the generated file under `/root/kem-vpn-clients/` securely to the phone. Do not commit it to GitHub.
7. Open KEM VPN, paste the complete profile, and press CONNECT.

The scripts create server keys only on the VPS and client keys only in the root-only client directory. Keep all keys private. Revoke a client by removing its peer from wg0 and the persistent config; do not simply share one profile among customers.

## Important: phone data sharing vs VPS VPN

A normal Android VPN app cannot automatically re-share the phone's SIM/Wi-Fi internet to remote users. The setup above uses the VPS bandwidth and VPS internet as the exit. To make remote users exit through your own SIM/Wi-Fi, a separate always-on owner gateway and reverse/site-to-site tunnel are required; Android carrier NAT, tethering restrictions, battery limits and operator terms can prevent this. Do not assume a phone alone can serve unlimited remote users.

## Capacity and cost

"Free" can mean you do not charge users, but the VPS, bandwidth and maintenance still cost money. Unlimited registered accounts are not the same as unlimited simultaneous users or speed. Start with a small, authorized test group and monitor bandwidth.

## Security

- Never commit WireGuard .conf files, private keys, passwords, or server credentials.
- Use one unique profile per user/device.
- If a profile is exposed, revoke and replace it immediately.
- Check local telecom and VPS provider terms before reselling or sharing connectivity.
