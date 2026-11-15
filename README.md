# Wi-Fi Package Manager

A web-based Wi-Fi business management platform. Each Wi-Fi operator will be able to manage their own customers, packages, vouchers, payments and compatible router from one dashboard.

## Product direction

This project is **not a VPN service**. WireGuard, VPN subscriptions, VPN client configuration and VPN exit-server functionality are out of scope. The software does not provide internet connectivity or bandwidth: each operator supplies their own internet connection through an ISP, fibre or a SIM/data router.

## Planned operator features

- Separate operator accounts and isolated businesses (multi-tenant SaaS).
- Operator dashboard for customers, plans, vouchers, payments, sessions and reports.
- Time-based and data-based packages with price, speed, expiry and device limits.
- Router connection through a secure, server-side adapter.
- Create and expire hotspot vouchers/users, disconnect clients and apply supported speed/data limits.
- Platform owner console for software licences, operator accounts and support.

## Router integration

Router control is model-specific. The first practical integration target should be MikroTik RouterOS (HotSpot/User Manager or RouterOS API). Other brands such as TP-Link, Huawei and Tenda can only be supported where the exact model/firmware exposes a documented controller/API that permits these operations. A generic Wi-Fi router cannot automatically be controlled just because it broadcasts Wi-Fi.

Never expose router admin ports to the public internet or store router passwords in browser code. Use a restricted router API account and a secure management path.

## Current repository status

The existing membership backend and customer/admin pages are a prototype. The current database and admin model were originally single-operator and contain legacy VPN functionality. The web UI is being redirected to Wi-Fi package management, but multi-tenant isolation, software licensing, router adapters, voucher provisioning, live session monitoring and quota enforcement still need implementation and hardware testing. Do not sell it as a finished router controller yet.

## Run the membership API prototype

See [membership/README.md](membership/README.md). Production use requires HTTPS, secrets, backups, monitoring, tenant isolation and a tested router adapter.
