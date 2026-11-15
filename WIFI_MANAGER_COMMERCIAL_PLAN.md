# Wi-Fi Package Manager — Commercial SaaS implementation

## Product definition
A sellable web application for independent Wi-Fi operators. Each buyer manages their own hotspot business, customers, plans, payments, vouchers, router and reports. This product is not a VPN service and does not provide internet bandwidth. Every operator supplies an ISP/fibre/SIM connection.

## Buyer and tenant model
- Platform owner: Meshack / software vendor; manages software licences, tenant onboarding, billing status and support.
- Tenant/operator: a customer who buys a licence; can only access their own business.
- Tenant staff: optional role-limited users under one operator.
- Wi-Fi end customer: connects to that operator's hotspot and redeems a voucher/package.

## Router integration strategy
First supported hardware target: MikroTik RouterOS with HotSpot enabled and a restricted API user. RouterOS can create/disable hotspot users, set profile/rate limits and report active sessions. The exact model and RouterOS version must be verified.
A router behind carrier-grade NAT cannot safely be controlled by the cloud API through a random LAN address. Preferred design is an outbound, mutually authenticated connector/agent at the operator's site that polls the cloud API over HTTPS and talks to RouterOS locally. Never expose router management ports publicly or put router passwords in browser JavaScript.

Other brands are not automatically compatible. Add adapters only for exact models/firmware with supported APIs (or supported captive portal/RADIUS integration).

## Core commercial features
1. Tenant registration, licence purchase/activation/renewal/suspension.
2. Tenant isolation for every customer, plan, order, payment, voucher, router, session, log and report.
3. Operator dashboard: sales, active sessions, data usage, package expiry, router health.
4. Package builder: time quota, data quota, speed profile, device count, price, validity and schedule.
5. Voucher/QR generation and redemption; only activate after verified payment or authorized manual confirmation.
6. Router connector: provision hotspot account, set profile/limits, disconnect/revoke expired users.
7. Payment provider integration with server-side verification and reconciliation.
8. Audit logs, backups, rate limits, MFA/strong operator authentication and tenant-scoped support access.

## Current state
The repository is an early prototype, not a finished commercial router controller. The customer portal and owner settings exist, and the backend now has its VPN peer provisioning removed. Router settings currently save metadata only: there is no live router connector or hotspot user provisioning. The database is still a single-business prototype: multi-tenant isolation and buyer licensing are not yet implemented. Do not sell or advertise live router control until it is built and tested against real hardware.

## Immediate build order
- Complete web/PWA portal and smoke tests.
- Implement tenant schema and tenant-scoped auth before enabling multiple buyers.
- Implement platform owner licensing and tenant onboarding.
- Implement MikroTik outbound connector and RouterOS adapter.
- Add voucher provisioning, live session monitoring, quota enforcement and payment verification.
- Test with one MikroTik router and one ISP link, then add other router models.
