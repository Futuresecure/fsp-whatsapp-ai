# FSP Connect 2.1 — Staging Web App

## Resources and isolation

- GitHub repository `Futuresecure/fsp-whatsapp-ai`, `dev` branch only.
- Existing Supabase `fsp-whatsapp-ai` project `vzcpzhobtfwhurcsppdl`.
- Accepted v2.0 prototype, old CRM/database, and existing business website are untouched.
- New Supabase Edge Function: `fsp-connect-staging-api` (staging dashboard backend).
- Static web frontend: `staging-web` directory, intended for a new Vercel project with **Root Directory** `staging-web` and branch `dev`. No other GitHub repo needed.

## Login and authorization

1. Admin manually uses existing Supabase dashboard → Authentication → Users → Add user. Create an operator account with a verified business email only after business approval.
2. Do not enable open public sign-up. Supabase Auth email/password sign-in is used by the staging frontend; it offers no registration form.
3. In Supabase SQL Editor (project `vzcpzhobtfwhurcsppdl`), provision the user by ID *after* explicit authorization (replace the UUID and label):

```sql
INSERT INTO public.fsp_operators(user_id,role,active,display_name)
VALUES ('REPLACE-WITH-AUTH-USER-UUID','admin',true,'FSP Administrator')
ON CONFLICT (user_id) DO NOTHING;
```

4. Subsequent roles: `manager`, `agent`, `viewer`. Never derive roles from user-editable metadata. Operator `active=false` immediately blocks backend access on subsequent requests.
5. Configure Supabase Auth Redirect URLs for the eventual Vercel staging URL to enable password recovery. Never turn off authentication.

## Easiest existing-GitHub option: GitHub Pages (no new hosting account)

- Workflow `.github/workflows/staging-pages.yml` deploys **only** `staging-web/` from the `dev` branch to GitHub Pages.
- Repository owner must first enable GitHub Pages for this repository: GitHub → `fsp-whatsapp-ai` → Settings → Pages → Build and deployment → Source: **GitHub Actions**. This is a GitHub account setting; it is not enabled by committing a workflow.
- Then open the Actions tab and run `FSP Connect 2.1 Staging Web (GitHub Pages)` via **Run workflow** (branch `dev`) if it does not run automatically. Verify the run succeeds before sharing the URL.
- When enabled and deployed, GitHub Pages normally gives a repository-specific `github.io` HTTPS address, but **do not assert the address exists until Actions/Pages confirms it**.
- This creates a new Pages site for the separate `fsp-whatsapp-ai` repository; the existing business website and CRM stay untouched.
- If the repository is public, the Login page itself is public but all private messages still require server-side Supabase Auth + FSP operator access. Audit repository visibility before publishing source code.

## Vercel Frontend Deployment (alternative)

1. Connect the Vercel app, select **Import Git Repository** → `Futuresecure/fsp-whatsapp-ai`, **Root Directory** `staging-web`, **Production Branch** `dev` for staging project only (do not alter GitHub main).
2. Framework Preset: `Other`; Build command: none; Output directory: `.` or default static; install command: none.
3. Deploy and use the generated `*.vercel.app` HTTPS URL, Desktop and Mobile.
4. Ensure there is no automatic deployment from `main` and no cross-link with existing FSP website/CRM. Confirm CSP and authentication responses in browser.
5. Check API `/healthz`, sign-in, protected `/api/me`, dashboard counts, and role access before importing any live data.

## API behaviour and safety

- `GET /healthz` is public liveness only and contains no customer data.
- Every `/api/*` request verifies a Supabase Auth JWT directly with Supabase and checks active `fsp_operators` role server-side; no signup endpoint.
- `verify_jwt=false` at the Supabase Edge Gateway is intentional **only to permit browser CORS preflights**; function always checks JWT and operator for any data-bearing route. This must be security-tested before real customer data or public messaging is allowed.
- `GET /api/dashboard`, `/api/conversations`, `/api/contacts`, `/api/conversations/:id`, `/api/conversations/:id/messages`, `/api/settings` support backend data.
- `POST /api/conversations/:id/actions` is internal-only. No WhatsApp sending paths exist in this Edge Function.
- Broadcast OFF, AI Auto Reply OFF, Meta webhook not deployed, automation execution OFF.
- No operator account created or invited as part of this deployment.
- This is a staging environment, *not* a production-ready 9-module WhatsApp system; disabled modules are visibly labelled.

## Required deployment validation

- Public `/healthz` should show staging sending disabled.
- Unauthenticated `/api/me` must return HTTP 401.
- A valid Supabase Auth login **without** active FSP operator row must return HTTP 403.
- Provisioned Admin can read only this project's data and can save internal notes.
- Agent can only see assigned conversations. Viewer cannot write. No cross-operator IDOR.
- Desktop/mobile responsive navigation and login.
- No mock customer messages, false delivery statuses or automatic outgoing sending.
- Verify Auth recovery redirect URL and email delivery before claiming reset is ready.
- Before production: implement proper rate limiting, CSRF threat model for any cookie-based auth, policy review, staging isolation, privacy/retention review, actual Meta test phone integration, and rollback controls.

## Rollback

- Disable/remove Vercel staging project independently; keep accepted prototype and existing website unchanged.
- Supabase Edge Function can be disabled/rolled back via versioned source; do not delete Supabase project or production CRM data.
- No destructive database migration is required by this staging view.