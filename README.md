# KEM VPN

Starter web app for the KEM VPN membership portal.

## Included
- Responsive mobile-first login and registration UI (Swahili)
- Supabase email/password authentication
- Starter profiles table with Bronze, Silver, Gold and Platinum tiers
- Row Level Security policy for each user's own profile

## Setup
1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` to your Supabase Project URL.
3. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key.
4. In Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`.
5. In Supabase Authentication settings, configure the site URL and email confirmation settings.
6. Run `npm install`, then `npm run dev`. Use `npm run build` to create the production web build.

Never put a Supabase secret/service-role key in frontend code or commit it to GitHub.

## Current status
This is an initial frontend/authentication scaffold. Payment processing, VPN tunnel/server provisioning, admin controls, subscriptions, chat, and production APK packaging are not implemented yet. They require further backend and infrastructure setup.
