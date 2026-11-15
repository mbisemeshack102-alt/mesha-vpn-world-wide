# KEM VPN — VPS-first deployment and connectivity plan

## Permanent architecture decision

The VPS is a permanent core component of KEM VPN. Do not remove, replace with a phone-hosted server, or treat it as optional. The production VPS hosts the Membership API, persistent database/backup jobs, and the WireGuard server interface. Android devices are clients only.

## Network paths and test priority

- **Wi-Fi is the primary network path for initial setup and routine testing.** Validate the app and WireGuard tunnel on a stable Wi-Fi connection first.
- **SIM/mobile data is the secondary path for additional testing.** After Wi-Fi passes, test the same VPS tunnel using mobile data, including reconnects and network handover.
- Both Wi-Fi and mobile data can carry the WireGuard tunnel to the same permanent VPS. The VPS remains the hub in either case.
- Android's operating system selects/manages the active/default network. The app must not promise that it can force the handset to switch its SIM/Wi-Fi radio.
- WireGuard carries the VPN tunnel over whichever usable network Android routes it through. Mobile-data/Wi-Fi handover must be tested on supported Android versions and devices.
- The HTTPS API endpoint and WireGuard UDP endpoint are separate endpoints and must both be configured and monitored.

## Server responsibilities

1. Ubuntu VPS with a stable public IP or DNS name.
2. WireGuard server interface (normally wg0), IPv4 forwarding, firewall and NAT.
3. Membership API over HTTPS, with secrets held only in a root-readable environment file.
4. Persistent SQLite data directory and automated encrypted off-site backups.
5. WireGuard peer lifecycle tied to verified paid subscriptions: create, retrieve client config/QR, expire and revoke.
6. Monitoring for API health, WireGuard interface, disk space, backup freshness and certificate expiry.

## Important current deployment constraint

The current `membership/compose.yaml` runs the API as an unprivileged container and does not grant `CAP_NET_ADMIN` or install/configure host WireGuard tools. Therefore the existing Compose setup must NOT be assumed to provision peers on the host. Do not solve this by granting broad privileged/root container access.

For production, choose and test one explicit least-privilege deployment model:
- Preferred initial model: run the API as a dedicated Linux service on the VPS with only the required `CAP_NET_ADMIN` capability, access to the host `wg` executable, and write access only to its database/log directories; or
- a separately reviewed isolated network-management helper with a narrow authenticated local interface. The public API must never expose a shell or arbitrary command execution.

Do not enable WireGuard provisioning until the chosen model has been security-reviewed and tested on the actual VPS.

## Secrets and persistence

- Never commit `.env`, server private keys, customer private keys, payment credentials, admin PINs or API secrets.
- Keep the WireGuard server private key on the VPS only.
- Keep the database on persistent storage, not a container's disposable writable layer.
- Back up the database and WireGuard server configuration securely; test restoring them to a replacement VPS.
- A VPS migration must preserve the public endpoint where possible, or update DNS and client endpoint settings in a controlled migration.

## Launch acceptance checklist

- [ ] Build/install dependencies cleanly on the target Ubuntu VPS.
- [ ] `GET /health` passes through the public HTTPS reverse proxy.
- [ ] Registration, login, plan listing and order history pass integration tests.
- [ ] Payment provider is approved/configured; webhook signature/status and exact amount/currency are verified. No manual payment is described as automatic.
- [ ] `wg show wg0` reports the expected live interface.
- [ ] API WireGuard status reports configured and responding.
- [ ] A test paid subscription provisions exactly one peer (idempotency verified).
- [ ] Android imports the generated config/QR and a real tunnel passes traffic over Wi-Fi first.
- [ ] The same tunnel is tested over SIM/mobile data, including reconnect and handover.
- [ ] Peer is revoked at subscription expiry and admin revoke is tested.
- [ ] Firewall, HTTPS, rate limits, backups, restore, logs and monitoring pass review.

Until these checks pass, describe the project as under deployment/testing, not production-ready. A VPS purchase alone does not finish WireGuard, payment onboarding, Android integration or testing.
