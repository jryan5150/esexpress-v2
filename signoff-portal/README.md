# ES Express Workbench — Sign-off Portal

Shareable web portal for design sign-offs. Jessica (or any reviewer)
opens the link, walks through 13 sections paired against their original
email, and signs. Submission generates a timestamped PDF and emails it
to both parties via Microsoft Graph.

- **Live URL:** https://esexpress-signoff-portal.vercel.app/
- **Stack:** Vercel static + single serverless function + `pdf-lib` + Microsoft Graph `sendMail`
- **Vercel project:** `i-wuntu/esexpress-signoff-portal`
- **Current mode:** `DEV_MODE=1` (no email sent — PDF returned inline). Flip to production by removing the env var after Azure setup.

---

## Layout

```
signoff-portal/
├── api/
│   └── signoff.js        # POST endpoint → PDF → Graph sendMail
├── public/
│   └── index.html        # Full 13-section mockup + sign-off form
├── package.json          # pdf-lib dependency
├── vercel.json           # Function config + rewrites
└── test-local.mjs        # Local smoke test (node test-local.mjs)
```

---

## Azure setup (required to flip out of DEV_MODE)

The serverless function uses **Microsoft Graph `/users/{from}/sendMail` with
client-credentials flow**. An Azure app registration with `Mail.Send`
Application permission is required.

### One-time setup

1. **Register app** — Entra admin center → App registrations → New registration
   - Name: `ES Express Signoff Portal`
   - Supported account types: Single tenant (your Lexcom tenant)
   - No redirect URI needed

2. **Grant API permission** — Manage → API permissions → Add
   - Microsoft Graph → Application permissions → `Mail.Send`
   - Click **Grant admin consent** for the tenant

3. **Create client secret** — Manage → Certificates & secrets → New client secret
   - Description: `signoff-portal`, expires in 12 months
   - Copy the **Value** (shown once only)

4. **Collect the three values**:
   - Tenant ID — Overview → Directory (tenant) ID
   - Client ID — Overview → Application (client) ID
   - Client Secret — from step 3

### Set Vercel env vars

From the repo root, with Vercel CLI:

```bash
cd signoff-portal
vercel env add GRAPH_TENANT_ID       production   # paste the tenant id
vercel env add GRAPH_CLIENT_ID       production   # paste the client id
vercel env add GRAPH_CLIENT_SECRET   production   # paste the client secret
vercel env add SIGN_OFF_FROM_EMAIL   production   # e.g. jryan@lexcom.com
vercel env add SIGN_OFF_CC           production   # optional, comma-separated
vercel env rm  DEV_MODE              production   # flip off dev mode

# Redeploy
vercel deploy --prod --yes
```

### Security note

`Mail.Send` Application permission lets this app send as **any** user in
the tenant. If that's too broad, switch to **RBAC for Applications**
(newer model, scoped to a specific mailbox). See:
https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access

---

## Deploy / redeploy

```bash
cd signoff-portal
npx vercel deploy --prod --yes
```

---

## Test locally

```bash
cd signoff-portal
node test-local.mjs          # smoke-test the function, writes PDF to /tmp/test-signoff.pdf
npx vercel dev               # full local server at http://localhost:3000 (optional)
```

---

## Notes

- Static HTML is served directly from `/public/index.html`.
- `vercel.json` rewrites `/sign/:slug` → `/index.html` so personalized links
  (e.g. `/sign/jessica-2026-04-17`) don't 404.
- The mockup is self-contained — no build step, no CDN-dependent frameworks
  beyond Google Fonts. Safe to open offline.
- `DEV_MODE=1` returns the PDF base64 in the response instead of emailing —
  useful for preview before Azure is set up.
