#!/usr/bin/env node
/**
 * Obtain a Microsoft Graph refresh token with Mail.Send scope.
 *
 * Mirrors lexcom-command-center/scripts/ms-auth.py but adds Mail.Send
 * so the signoff portal can send email on your behalf.
 *
 * Usage:
 *   MS_TENANT_ID=<guid> MS_CLIENT_ID=<guid> node scripts/ms-auth-mail-send.mjs
 *
 * The existing Command Center app registration works — tenant/client ids
 * are in /home/jryan/projects/personal/lexcom-command-center/.env
 */

const tenantId = process.env.MS_TENANT_ID;
const clientId = process.env.MS_CLIENT_ID;

if (!tenantId || !clientId) {
  console.error("Set MS_TENANT_ID and MS_CLIENT_ID env vars first.");
  console.error(
    "  MS_TENANT_ID=<guid> MS_CLIENT_ID=<guid> node scripts/ms-auth-mail-send.mjs",
  );
  process.exit(1);
}

const scope =
  "offline_access Mail.Send Mail.Read User.Read";
const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

async function main() {
  // 1. Request device code
  console.log("Requesting device code…");
  const devRes = await fetch(`${tokenUrl}/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope }),
  });
  if (!devRes.ok) {
    console.error(`Device code request failed: ${devRes.status}`);
    console.error(await devRes.text());
    process.exit(1);
  }
  const dev = await devRes.json();
  console.log("");
  console.log("=".repeat(60));
  console.log(`Go to: ${dev.verification_uri}`);
  console.log(`Enter code: ${dev.user_code}`);
  console.log("=".repeat(60));
  console.log("");
  console.log(
    "Log in as the user who should send the sign-off emails (e.g. jryan@lexcom.com).",
  );
  console.log("Consent to Mail.Send + Mail.Read + offline_access.");
  console.log("");
  console.log("Waiting for authentication…");

  // 2. Poll for token
  let interval = dev.interval ?? 5;
  while (true) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    const res = await fetch(`${tokenUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: dev.device_code,
      }),
    });
    const body = await res.json();
    if (body.access_token) {
      console.log("");
      console.log("Authentication successful.");
      console.log("");
      console.log("Add these to Vercel env for the signoff-portal project:");
      console.log("");
      console.log(`MS_TENANT_ID=${tenantId}`);
      console.log(`MS_CLIENT_ID=${clientId}`);
      console.log(`MS_REFRESH_TOKEN=${body.refresh_token ?? ""}`);
      console.log("");
      console.log(
        "Or run the helper below (requires vercel CLI authenticated as jryan):",
      );
      console.log("");
      console.log(
        `  cd signoff-portal && \\\n    printf '${tenantId}' | vercel env add MS_TENANT_ID production && \\\n    printf '${clientId}' | vercel env add MS_CLIENT_ID production && \\\n    printf '${body.refresh_token}' | vercel env add MS_REFRESH_TOKEN production`,
      );
      console.log("");
      return;
    }
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      interval += 5;
      continue;
    }
    console.error(
      `Error: ${body.error_description ?? body.error ?? "unknown"}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
