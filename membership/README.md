# KEM WIFI PRO SECURE

KEM WIFI PRO SECURE is being developed as a **sellable Wi-Fi package management platform** for independent Wi-Fi operators.

## Important scope

- No VPN service, WireGuard tunnel, VPN exit server or VPN client configuration.
- The software does not supply internet or data bundles. Each operator must already have an internet connection from an ISP, fibre provider or SIM/data router.
- Each operator is intended to have a separately licensed account, router connection, customer portal, packages and reports.

## Existing prototype features

- Phone-number customer registration and login.
- Package catalogue and subscription/order records.
- Admin PIN session and editable package/payment settings.
- QR/access-code scaffolding.
- Router metadata and Site Connector enrollment/heartbeat foundation.
- KEM WIFI PRO SECURE PWA name, icon and install metadata.

## Not implemented yet — do not represent as live

The current database is still single-operator; it does not yet provide tenant isolation or a software licensing/subscription system for buyers. Router settings are only metadata: there is no production router adapter, live voucher/user creation, client disconnection, speed/data enforcement or live connected-client reporting. Payment settings are not proof of an active payment gateway. The Site Connector currently enrolls and sends heartbeat only; it does not execute router commands. These capabilities must be built and tested before commercial release.

## Required product implementation

1. Add multi-tenant operator accounts and tenant_id isolation to every business-owned record.
2. Add platform-owner licensing: create, activate, suspend and renew each buyer's software licence.
3. Give each operator a separate dashboard, customer portal, package catalogue, payments and reports.
4. Build secure router adapters, starting with MikroTik RouterOS. Confirm exact model, RouterOS version, network topology and API permissions before integration.
5. Provision hotspot vouchers/users after verified payment; enforce expiry, data quota, speed and device limits on the router/controller.
6. Add live session/traffic reporting, audit logs, backup/restore and security tests.
7. Test with real supported routers and ISP connections before selling.

## Development

Requires Node.js 22+.

```sh
npm install
cp .env.example .env
npm start
```

Set a strong random TOKEN_SECRET and owner PIN hash in the private environment. Run behind HTTPS. Never commit secrets or router credentials.
