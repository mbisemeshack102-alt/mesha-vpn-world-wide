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


## Editable Admin settings (new)

The API now includes persistent settings stored in SQLite:

- `GET /api/payment-settings` — returns the currently configured public payment instructions.
- `GET /api/admin/settings` — protected by `x-admin-key`; returns payment and plan settings.
- `PUT /api/admin/settings` — protected by `x-admin-key`; updates the Airtel Lipa Namba, recipient name, payment methods, instructions, and Bronze/Silver/Gold/Platinum prices, speeds, device counts and data allowances.

Example request body (send only from a trusted admin tool over HTTPS):

```json
{
  "payment": {
    "airtelLipaNumber": "YOUR_AIRTEL_LIPA_NUMBER",
    "recipientName": "YOUR_REGISTERED_RECIPIENT_NAME",
    "enabledMethods": ["airtel_money", "mpesa", "mixx_by_yas", "halopesa", "bank", "visa", "mastercard"],
    "instructions": "Follow the displayed merchant payment instructions."
  },
  "plans": {
    "bronze": {"name":"Bronze","speedMbps":2,"devices":1,"data":{"day":1,"week":2,"month":10},"price":{"day":500,"week":1500,"month":5000}},
    "silver": {"name":"Silver","speedMbps":5,"devices":2,"data":{"day":2,"week":5,"month":25},"price":{"day":1000,"week":3000,"month":10000}},
    "gold": {"name":"Gold","speedMbps":10,"devices":3,"data":{"day":4,"week":12,"month":60},"price":{"day":2000,"week":6000,"month":20000}},
    "platinum": {"name":"Platinum","speedMbps":15,"devices":5,"data":{"day":8,"week":25,"month":120},"price":{"day":3500,"week":10500,"month":35000}}
  }
}
```

The payment number is intentionally blank by default; configure it through the protected admin endpoint after verifying the official Airtel merchant details. The enabled methods are display/configuration flags only: mobile-money, bank and card checkout are **not** automatically processed by this endpoint. ClickPesa merchant onboarding, checkout API integration and verified webhooks are still required before automatic payment activation. Never put the admin key or payment-provider secrets in the Android APK.


## Admin Dashboard (new)

After deploying the membership API behind HTTPS, open `https://YOUR_API_HOST/admin/`.
Enter the server-side `ADMIN_API_KEY` in the dashboard, load the saved settings, then update payment display details or plan prices/quotas and save. The dashboard calls the protected `GET /api/admin/settings` and `PUT /api/admin/settings` routes; the key is not compiled into the Android app. Keep the admin key private and use the dashboard only over HTTPS.

The API also exposes `GET /api/payment-settings` for public payment instructions. `GET /api/plans` now reads the configured plan values. Only supported payment method labels can be selected. These settings do not process or verify payments. Manual transaction review remains required until an official merchant checkout and signed webhook integration is implemented.


## Docker deployment (new)

On an Ubuntu/Debian VPS with Docker Engine and the Docker Compose plugin installed:

```sh
cd membership
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Put the first generated value in `TOKEN_SECRET` and the second in `ADMIN_API_KEY` inside `.env`. Keep this file private; it is excluded from the Docker build. Then run:

```sh
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml logs -f
```

The API listens on the VPS loopback address at port 8080, with SQLite data in a persistent Docker volume. Put a reverse proxy such as Caddy or Nginx in front and enable HTTPS before exposing it publicly. Do not change the port binding to `0.0.0.0` unless a secure reverse proxy/firewall is configured. Check `http://127.0.0.1:8080/health` from the VPS. The admin page will be available at `https://YOUR_API_HOST/admin/` after HTTPS is configured.

Login and registration attempts are rate-limited. This container setup is a deployment starter, not a substitute for TLS, backups, monitoring, firewall rules, security updates, and a tested restore plan.
