# Wi-Fi Package Manager Site Connector (bootstrap)

## Requirements

- Node.js 22 or newer.
- A reachable Wi-Fi Package Manager API.
- HTTPS for any non-local deployment.

## First enrollment

1. Sign in to the Wi-Fi Package Manager admin panel/API.
2. Create a one-time token using `POST /api/admin/site-connectors/enrollments`.
3. On the local computer/Raspberry Pi inside the operator's network, set:

```sh
export WIFI_MANAGER_API_URL="https://your-management-domain.example"
export WIFI_MANAGER_ENROLLMENT_TOKEN="paste-one-time-token"
node agent.js
```

4. The agent exchanges the enrollment token once and saves its connector token in `./data/connector-token.json` with owner-only permissions.
5. On later starts, the saved connector token is used; the enrollment token is no longer needed.

For a local development server only, `http://localhost:8080` is accepted. Do not use plain HTTP over a network.

## Current capability

This bootstrap agent enrolls and sends authenticated heartbeats every 30 seconds. It uses outbound HTTPS requests, so no inbound router port needs to be opened. It does not yet connect to MikroTik or execute router commands. RouterOS API transport, encrypted credential vault, command queue/signatures, and multi-tenant isolation are still pending. Do not advertise it as a production router-control agent yet.
