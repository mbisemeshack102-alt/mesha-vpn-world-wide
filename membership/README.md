# Wi-Fi Package Manager API (prototype)

This service is being repurposed from an earlier VPN membership experiment into a **sellable Wi-Fi package management platform**.

## Important scope

- No VPN service, WireGuard tunnel, VPN exit server or VPN client configuration.
- The software does not supply internet or data bundles. Each operator must already have an internet connection from an ISP, fibre provider or SIM/data router.
- The software is intended to let multiple independent Wi-Fi operators buy/use their own licensed account, connect a supported router and manage their own customers and packages.

## Existing prototype features

- Phone-number customer registration and login.
- Package catalogue and subscription/order records.
- Admin PIN session and editable package/payment settings.
- QR/access-code scaffolding.
- Preliminary router metadata fields.

## Not implemented yet — do not represent as live

The current database is still single-operator; it does not yet provide tenant isolation or a software licensing/subscription system for buyers. Router settings are only metadata: there is no live router adapter, voucher/user creation, client disconnection, speed/data enforcement or live connected-client reporting. Payment settings are not proof of an active payment gateway. These capabilities must be built and tested before commercial release.

## Required product implementation

1. Add multi-tenant operator accounts and tenant_id isolation to every business-owned record.
2. Add platform-owner licensing: create, activate, suspend and renew each buyer's software licence.
3. Give each operator a separate dashboard, customer portal, package catalogue, payments and reports.
4. Build a secure router adapter, starting with MikroTik RouterOS. Confirm exact model, RouterOS version, network topology and API permissions before integration.
5. Provision hotspot vouchers/users after verified payment; enforce expiry, data quota, speed and device limits on the router/controller.
6. Add live session/traffic reporting, audit logs, backup/restore and security tests.
7. Test with a real supported router and ISP connection before selling.

## Development

Requires Node.js 22+.

```sh
npm install
cp .env.example .env
npm start
```

Set a strong random TOKEN_SECRET and owner PIN hash in the private environment. Run behind HTTPS. Never commit secrets or router credentials.
