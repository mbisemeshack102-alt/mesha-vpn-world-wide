# KEM AI online setup

The Android client calls the Supabase Edge Function at
`{KEM_SUPABASE_URL}/functions/v1/kem-ai`.

## Required project settings

Use a dedicated Supabase project for KEM VPN. Do not reuse another app's project unless its owner explicitly approves.

In the GitHub repository settings, add these Actions secrets:

- `KEM_SUPABASE_URL`: the KEM VPN Supabase project URL.
- `KEM_SUPABASE_ANON_KEY`: the project's publishable/anon key. This is a public client key; protect data with server-side authorization and RLS.

The APK build workflow reads these secrets as Gradle properties. If they are absent, KEM AI displays a setup message instead of contacting a service.

## Deploy the Edge Function

Install Supabase CLI, then run from the repository root:

```sh
supabase login
supabase link --project-ref YOUR_KEM_VPN_PROJECT_REF
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase functions deploy kem-ai
```

Keep `OPENAI_API_KEY` only in Supabase Secrets. Never put it in the Android app, GitHub source, or a public issue. Keep JWT verification enabled for the function.

After adding the two GitHub Actions secrets and deploying the function, run the **Build KEM VPN APK** workflow again and install its artifact to test online questions.

## API contract

POST JSON: `{"question":"..."}`

Success JSON: `{"answer":"..."}`

The function calls the OpenAI Responses API server-side. Add rate limiting and abuse monitoring before public launch; do not expose an unauthenticated production endpoint.
