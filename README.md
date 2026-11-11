# KEM VPN

KEM VPN is an Android VPN client project. This milestone creates a buildable Android starter app and an automated APK build workflow.

## Current milestone

- Android application scaffold (Kotlin)
- Starter connection screen
- GitHub Actions workflow to build a debug APK

IMPORTANT: This starter APK is not yet a working VPN. The Connect button deliberately reports that server setup is required. Do not advertise or distribute it as providing VPN connectivity yet.

## Planned architecture

1. Android client using Android VPN APIs and the WireGuard tunnel implementation.
2. A managed Linux VPS as the VPN exit server.
3. An optional owner-controlled gateway for routing traffic from an authorized Wi-Fi or mobile-data connection.
4. Backend service for issuing/revoking client configurations and managing accounts.

A phone's SIM or Wi-Fi connection cannot automatically be shared with remote users just by installing a VPN app. The owner-side gateway, routing, public/reachable server path, and carrier/router support must be configured. Mobile operators may restrict tethering or commercial resale; confirm your plan permits it. User capacity depends on bandwidth and server resources, so unlimited accounts cannot mean unlimited simultaneous throughput.

## Build the APK

GitHub Actions runs the workflow named Build KEM VPN APK. After a successful run, open the workflow run, find Artifacts, and download kem-vpn-debug-apk.

For a local build with JDK 17 and Gradle 8.9, run gradle assembleDebug.

The debug APK is generated at app/build/outputs/apk/debug/app-debug.apk.

## Next milestone

Integrate the WireGuard tunnel engine, add secure server provisioning, and implement an owner-side gateway. Never commit private keys, server credentials, or user VPN configuration secrets to this repository.
