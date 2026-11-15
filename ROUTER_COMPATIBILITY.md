# Router compatibility strategy

## Product promise
The software is designed to support many router brands through replaceable integrations. It must not promise that every router can be fully controlled. Automatic access control requires a documented management API, captive portal integration, or external RADIUS support. Unsupported routers can use Manual Mode for package display, sales and voucher records only.

## Integration methods
1. Vendor API/controller for client, session and guest access management.
2. RADIUS for cross-vendor authentication and accounting where supported.
3. Captive portal redirect to the operator's branded customer portal.
4. Site connector: a small service on the operator LAN makes an outbound authenticated HTTPS connection to the SaaS and talks to the router locally. This avoids exposing router admin ports and supports many NAT/CGNAT setups.
5. Manual Mode for basic routers without integration support. It does not provision or disconnect devices automatically.

## Adapter registry
The file membership/src/router-adapters.js is the central capability registry. Dashboard forms should load this list instead of hard-coding one router brand. Each adapter declares its connection method, capabilities, implementation status and compatibility note. A planned entry is not a working driver; test exact models and firmware before marking it available.

## Initial compatibility targets
| Family | Integration | Status |
|---|---|---|
| MikroTik RouterOS | RouterOS API via site connector; HotSpot | Planned |
| OpenWrt | ubus/hostapd or RADIUS | Planned |
| Ubiquiti UniFi | UniFi Network controller API or RADIUS | Planned |
| TP-Link Omada | Omada controller API or RADIUS | Planned |
| Other RADIUS-capable routers/APs | RADIUS authentication/accounting | Planned |
| Basic home routers | Manual Mode | Available (no automatic access control) |

## Common driver contract
Drivers should implement testConnection, getStatus, createAccessUser, disableAccessUser, disconnectSession, getSessions and getUsage. The first two are required by the initial registry loader; the remaining methods must be added only with working implementations.

## Security requirements
- Store router credentials encrypted server-side; never send them to dashboard JavaScript.
- Prefer outbound mutually authenticated connector connections; do not expose router admin ports publicly.
- Use least-privilege router accounts, credential rotation, connector revocation and audit logs.
- Validate controller certificates and restrict connector commands to an allow-list.
- Scope every router, connector, voucher, user, session and command to its tenant.
- Never claim speed, data quota, expiry or disconnect enforcement unless the router/AAA integration confirms it.

## Implementation sequence
1. Add the adapter registry and let the dashboard select an integration family.
2. Build a secure site connector with tenant/device identity and signed, expiring commands.
3. Implement RADIUS for supported equipment.
4. Add and test vendor drivers one by one against exact models, firmware and controller versions.
5. Keep Manual Mode for hardware that cannot be controlled automatically.

## Important limitation
No software can guarantee full compatibility with an arbitrary router model or firmware. Some consumer routers expose no supported API, RADIUS, or captive portal hook. Full automation on those devices requires a compatible external access point/controller or separate hotspot gateway.
