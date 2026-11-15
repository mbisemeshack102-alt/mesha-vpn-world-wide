# KEM VPN Membership API — Termux (Android)

This guide is for running the membership API locally in Termux. It does not deploy the API to the public internet and does not create a WireGuard tunnel.

## Requirements

- Node.js 22 or newer
- Termux packages: Python, make, clang, pkg-config and OpenSSL

## Install and build SQLite

Run these commands from the `membership` directory:

```sh
pkg update
pkg install python make clang pkg-config openssl -y
npm install
npm install-scripts approve better-sqlite3
npm rebuild better-sqlite3
```

Check that the native SQLite binding really works (this creates a temporary in-memory database):

```sh
node -e "const D=require('better-sqlite3');const db=new D(':memory:');db.exec('CREATE TABLE test(id INTEGER)');console.log('SQLITE NATIVE READY');db.close()"
```

The expected output is `SQLITE NATIVE READY`. If the build fails, keep the complete error output; do not delete the project or database.

## Start the local API

Generate two different secrets in the same Termux session. Never paste them into chat or commit them to GitHub:

```sh
export TOKEN_SECRET="$(openssl rand -hex 32)"
export ADMIN_API_KEY="$(openssl rand -hex 32)"
npm start
```

The API listens on port 8080. In a second Termux session, test it:

```sh
curl http://127.0.0.1:8080/health
```

Expected response:

```json
{"ok":true,"service":"KEM VPN Membership API"}
```

Keep the first Termux session open while testing. If you close it, the server stops and the exported secrets are lost; generate new secrets before restarting unless you have stored them securely outside Git.

## Important limitations

- A successful `/health` response confirms only that the membership API is running.
- It does not mean WireGuard is installed, a VPN peer has been provisioned, or a VPN tunnel is connected.
- Public access requires a securely deployed server with HTTPS and firewall rules. A phone running Termux is only a local test host.
- Do not put `.env`, admin keys, payment-provider credentials, customer data or WireGuard private keys in GitHub or in the Android APK.
