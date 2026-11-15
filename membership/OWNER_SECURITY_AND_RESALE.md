# KEM VPN owner security and resale readiness

## Owner-only administration

- The Admin Site is protected by the server-side `ADMIN_PIN_HASH`; the PIN itself must never be committed or placed in the APK.
- Admin login is rate-limited to five attempts per 15 minutes per client IP.
- Admin sessions expire after 30 minutes and are stored as SHA-256 token hashes so they can be revoked on logout.
- Admin API endpoints send no-store cache headers.
- Permanent `X-Admin-Key` access has been removed. Admin API access requires a valid, unexpired server-issued session.
- Serve the Admin Site and API over HTTPS only. Restrict the VPS firewall and keep operating-system and Node dependencies updated.

## WireGuard private keys

- Never put the VPS WireGuard server private key in the Admin Site, APK, Git repository, or public environment template.
- Client peer private keys are generated server-side and stored encrypted in the membership database. The Admin Site must not return or render them.
- A customer's WireGuard configuration necessarily contains that customer's client private key; deliver it only to that authenticated customer over HTTPS and do not log it.
- Admin views may show peer status, client address, and public key, but not private keys.
- Keep `TOKEN_SECRET` secret and back it up securely; existing encrypted access codes, QR tokens, and client peer keys depend on it. Plan any key rotation as a tested migration, not a casual environment change.

## Selling / white-label readiness

The current branch is a single-owner, single-tenant KEM VPN deployment. It is not yet a multi-tenant reseller platform. Before selling copies or hosting multiple independent operators, implement and test:
1. tenant/operator records and strict tenant scoping on every database query;
2. owner, reseller, and support roles with least privilege;
3. per-tenant branding, domain, pricing, payment credentials and usage limits;
4. subscription/licence terms, provisioning, suspension and renewal;
5. tenant-isolated audit logs, backups, export and deletion;
6. automated security tests proving one reseller cannot read or change another reseller's customers, payments, peers or secrets.

Do not advertise multi-tenant isolation or production security until these controls have been implemented and independently tested.
