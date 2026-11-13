# KEM VPN

KEM VPN is a mobile-first web app built with JavaScript, Vite and Supabase authentication.

## Free hosting (no VPS)
The project is configured for GitHub Pages. Pushes to the `main` branch trigger a free static deployment through GitHub Actions.

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Wait for the **Deploy KEM VPN to GitHub Pages** workflow to finish.
4. Open the Pages URL and use your Android browser menu → **Add to Home screen / Install app**.

## Local development
1. Copy `.env.example` to `.env`.
2. Add the Supabase Project URL and Publishable Key.
3. Run `npm install`, then `npm run dev`.
4. Run `npm run build` to verify the production build.

## Current capabilities and limits
- Responsive Swahili login and registration UI.
- Supabase email/password authentication when valid Supabase settings are supplied.
- Password reset flow through Supabase email.
- Installable PWA shell and basic offline caching of the app shell.
- Mobile data and Wi-Fi are internet connection methods; the app can use either when available.
- Offline caching does **not** provide internet access or a VPN tunnel.
- A real VPN connection needs a VPN server/backend and a native Android VPNService or supported WireGuard integration. No VPN server is configured yet, so the app must not display a false connected state.
- GitHub Pages hosts the web app for free for public repositories; it is not a VPN server.

Never put a Supabase secret/service-role key in frontend code or commit it to GitHub.
