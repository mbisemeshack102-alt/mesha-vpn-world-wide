# Site Connector enrollment foundation

This commit adds secure one-time enrollment and long-lived connector credential primitives.

## Current API

- Admin: `POST /api/admin/site-connectors/enrollments` creates a one-time enrollment token (10-minute default).
- Connector: `POST /api/site-connectors/enroll` exchanges that token once for a connector ID and bearer token.
- Connector: `POST /api/site-connectors/heartbeat` authenticates the bearer token and updates last-seen time.
- Admin: `GET /api/admin/site-connectors` lists connector metadata only.
- Admin: `POST /api/admin/site-connectors/:id/revoke` revokes a connector credential immediately.

Only SHA-256 hashes of enrollment and connector tokens are stored. The raw connector token is returned once at enrollment and must be stored locally with restrictive file permissions. Always use HTTPS in production.

## Important scope limitation

The current server is a single-operator installation. These credentials are scoped to that installation, not to independently isolated tenants. Do not deploy one shared server for multiple Wi-Fi businesses until tenant ownership and data isolation are implemented. Heartbeat is implemented; command polling, RouterOS API transport, local encrypted credential storage, and production packaging of the connector agent are not yet implemented. This is a secure enrollment/API foundation, not a production-ready remote router-control service.
