# KEM VPN Membership API (starter)

This service is the first backend foundation for Bronze, Silver, Gold and Platinum memberships.

## Current status — prototype, not production-ready

- Phone-number registration and login.
- Signed bearer sessions.
- Day (1), week (7) and month (30-day) offers.
- Pending orders and an admin-only manual payment confirmation route.
- Subscription expiry is checked when the account requests `GET /api/me`.
- Plan limits (data, speed and devices) are returned as entitlement metadata. They are **not yet enforced by WireGuard**.

The prices and quotas in `src/server.js` are draft examples. Review them against actual SIM/router costs, bandwidth, gateway fees and your business plan before selling access.

## Install on a server

Use a supported Ubuntu/Debian VPS with Node.js 20+.

```sh
cd membership
npm install
cp .env.example .env
mkdir -p data
```

Edit `.env`. Generate two different secrets:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Put one in `TOKEN_SECRET`, the other in `ADMIN_API_KEY`. Keep `.env` private and never upload it to GitHub.

Start the API:

```sh
npm start
```

For production, run it behind HTTPS using a reverse proxy and a process manager. Restrict the admin route at the firewall as well.

## API outline

- `GET /health`
- `GET /api/plans`
- `POST /api/register` — JSON: `{ "phone": "07XXXXXXXX", "password": "at-least-8-chars" }`
- `POST /api/login` — same JSON fields
- `GET /api/me` — `Authorization: Bearer <token>`
- `POST /api/orders` — authenticated JSON: `{ "planId": "bronze", "duration": "day" }`; duration can be `day`, `week`, or `month`
- `GET /api/orders` — authenticated order history
- `POST /api/admin/orders/:id/confirm` — header `x-admin-key: <ADMIN_API_KEY>`, JSON: `{ "paymentReference": "verified-reference" }`

## Payment gateway

Payment is deliberately **not automated yet**. Orders stay pending. Do not ask customers to send money to a personal number or activate service based only on a screenshot. An administrator must first verify a real transaction in the official merchant dashboard and then confirm the order using the protected admin route.

ClickPesa advertises collections through M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, cards and bank channels, plus API/webhook integration. Before enabling automatic activation, KEM VPN must obtain a merchant account and current API credentials, configure the provider's documented checkout and webhook flow, verify webhook authenticity/signatures, and reconcile the transaction amount, currency, order ID and final paid status on the server. API secrets must never be placed in the Android APK or GitHub. See https://clickpesa.com/payment-gateway/collection/ and https://docs.clickpesa.com/ .

## Still required before launch

1. Connect this API to the Android app's registration, login, plan selection and order screens.
2. Complete and test the official payment provider integration in sandbox, then production.
3. Issue a unique WireGuard peer after a verified payment.
4. Enforce expiry, data quota, speed and device limits at the VPN server; current metadata alone does not enforce them.
5. Add admin UI, audit logs, backups, HTTPS, rate limiting, monitoring and recovery procedures.
6. Test with a small number of consenting users and confirm that the internet provider's terms permit the intended sharing/resale.

Do not promise unlimited data or unlimited simultaneous users. The owner-side SIM/Wi-Fi relay architecture is also a separate task from this membership API.
