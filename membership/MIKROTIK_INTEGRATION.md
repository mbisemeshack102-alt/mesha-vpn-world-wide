# MikroTik RouterOS integration

The MikroTik driver is an adapter module for the Wi-Fi Package Manager. It does not open a public connection to a router and it does not store router credentials.

## Required deployment shape

Run a trusted site connector inside the operator's LAN. The connector establishes an outbound authenticated TLS connection to the management service and supplies a RouterOS API transport to `makeDriver(transport)`. The transport contract is:

- `command(path, attributes)` executes one RouterOS API command and resolves to an array of attribute maps.
- RouterOS query attributes use keys such as `?name`; item selection uses `=.id`.
- Credentials and API transport remain on the operator's LAN/server side and must never be sent to browser JavaScript.

## Implemented operations

- Connection test and system resource status.
- List active hotspot sessions.
- Create hotspot vouchers with optional uptime and byte limits.
- Revoke a hotspot user by username.
- Disconnect an active session by RouterOS item ID.
- Update an existing hotspot user profile rate limit.
- Read hotspot user byte counters and uptime.

## Safety and limitations

This driver is not yet a complete production integration. It requires a tested RouterOS API transport and site connector. Test against a lab router first, confirm the exact RouterOS version and API behavior, use a dedicated least-privilege API account, restrict management access to the LAN, and enable TLS where supported. Do not expose RouterOS API ports to the public internet.

The operator's router must have HotSpot configured and the relevant profiles created. This adapter does not configure WAN, Wi-Fi radios, firewall rules, NAT, DHCP, or captive portal pages. Speed profiles update an existing HotSpot user profile; they do not create one. Validate voucher expiry and accounting behavior on the target RouterOS version before selling the integration as production-ready.
