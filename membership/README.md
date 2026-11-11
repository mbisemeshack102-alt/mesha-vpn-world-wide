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

Put one in `TOKEN_SECRET`, the other in `ADMIN_API_KEY`. Create a salted hash for your own six-digit owner PIN with Node.js (replace the example PIN with your own; do not use `123456`):

```sh
node -e "const c=require('node:crypto');const p='REPLACE_WITH_YOUR_6_DIGIT_PIN';const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))"
```

Put the printed `salt:hash` value in `ADMIN_PIN_HASH`. Keep `.env` private and never upload it to GitHub. The PIN itself must never be committed or sent in chat.

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

## Payment gateway — ClickPesa integration added

The API now has a ClickPesa Hosted Checkout integration scaffold using the current official API:
- Authenticates server-to-server using the ClickPesa Client ID and API Key; the JWT is cached in memory.
- Creates a unique checkout link for each authenticated KEM VPN order.
- Returns the hosted checkout URL to the app/client.
- Receives `PAYMENT RECEIVED` and `PAYMENT FAILED` webhook events at `POST /api/payments/clickpesa/webhook`.
- Before activating a subscription, independently queries ClickPesa's payment-status API and checks the exact order reference, SUCCESS status, TZS currency, amount and payment reference.
- Uses an idempotent database transaction so duplicate callbacks do not create duplicate subscriptions.
- Optionally verifies ClickPesa's HMAC-SHA256 webhook checksum when `CLICKPESA_CHECKSUM_KEY` is configured.

### Required ClickPesa setup

1. Register KEM VPN as a merchant with ClickPesa and complete their business/KYC approval. The gateway's production API is not available until merchant onboarding is approved.
2. In ClickPesa Dashboard → Settings → Developers, create a Hosted Checkout application and copy its Client ID and API Key. Configure the application webhook for `PAYMENT RECEIVED` and `PAYMENT FAILED`.
3. Deploy this API on a public VPS domain with HTTPS. Set `PUBLIC_BASE_URL` to that exact HTTPS origin.
4. Set `PAYMENT_PROVIDER=clickpesa`, `CLICKPESA_CLIENT_ID`, and `CLICKPESA_API_KEY` in the VPS environment. If checksum verification is enabled in ClickPesa, also set `CLICKPESA_CHECKSUM_KEY` to the same secret configured there.
5. Restart the API. Make a small real payment after ClickPesa approves the account, then confirm the webhook and order status in the merchant dashboard and KEM VPN database.

Example environment values (placeholders only):

```env
PAYMENT_PROVIDER=clickpesa
PUBLIC_BASE_URL=https://api.your-real-domain.tld
CLICKPESA_CLIENT_ID=your_client_id
CLICKPESA_API_KEY=your_private_api_key
CLICKPESA_CHECKSUM_KEY=your_checksum_key_if_enabled
```

Do not commit real values, send API keys in chat, or place them in the Android APK. Add them only to the VPS's private environment file. The example `.env.example` intentionally contains blanks.

Until merchant approval, valid credentials, HTTPS deployment and a real payment test are complete, keep `PAYMENT_PROVIDER=manual_review`. In that mode the API refuses to create paid checkout orders; it does not pretend payments are live. The existing Airtel Lipa Namba settings are display-only and are not an automatic API integration.

ClickPesa documents Hosted Checkout, token generation, payment status queries and webhooks here:
- https://docs.clickpesa.com/api-reference/collection/generate-checkout-link/generate-checkout-link
- https://docs.clickpesa.com/api-reference/authorization/generate-token
- https://docs.clickpesa.com/api-reference/collection/querying-for-payments/querying-for-payments
- https://docs.clickpesa.com/home/webhooks
- https://docs.clickpesa.com/home/checksum

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

After deploying the membership API behind HTTPS, open `https://YOUR_API_HOST/admin/`. Enter the owner's six-digit PIN. The server verifies its salted scrypt hash (`ADMIN_PIN_HASH`) and issues a signed admin session that expires after 30 minutes. The dashboard uses this short-lived bearer token for protected settings routes; it does not store the PIN or embed the admin key in the Android APK. Use HTTPS only, keep the PIN private, and press **Funga Admin** when finished. Login attempts are rate-limited. The legacy `ADMIN_API_KEY` remains available for trusted server-side maintenance tools only.

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


## ClickPesa payment API endpoints

- `POST /api/orders` — authenticated JSON: `{ "planId": "bronze", "duration": "month" }`. With ClickPesa configured, returns `payment.checkoutUrl` for the hosted payment page.
- `POST /api/payments/clickpesa/webhook` — public ClickPesa callback. It does not trust the browser return page; it queries ClickPesa's payment status before activating the membership.
- `GET /api/orders` — includes each order's checkout URL and status.

The API uses Node.js 20+ built-in `fetch`; no additional payment SDK is required.


## Owner Admin Lock (new)

- `POST /api/admin/login` accepts `{ "pin": "six digits" }` and checks the server-only `ADMIN_PIN_HASH`.
- Successful login returns a signed admin token valid for 30 minutes. Protected admin endpoints accept it as `Authorization: Bearer <token>`.
- The dashboard at `/admin/` now has an owner PIN lock and a manual lock button.
- If `ADMIN_PIN_HASH` is blank, PIN login is disabled. Configure it on the VPS before using the dashboard. Never put the PIN or its hash in the APK or GitHub.
- This protects the management dashboard; it does not yet add customer accounts, WireGuard peer provisioning, or in-app admin screens.
