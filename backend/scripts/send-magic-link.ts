// Convenience: fire a magic-link request for a given email and report
// what the API said. Useful for getting Crystal/Jenny logged in without
// hand-curling.
//
// Usage:
//   cd /home/jryan/projects/work/esexpress-v2
//   tsx backend/scripts/send-magic-link.ts crystal@esexpressllc.com
//
// Hits the live production API. The endpoint always returns success
// (anti-enumeration), so a "success" message doesn't strictly mean the
// email was sent — check the user's inbox or backend logs to confirm.

const API_URL =
  process.env.API_URL ||
  "https://backend-production-7960.up.railway.app/api/v1";

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx backend/scripts/send-magic-link.ts <email>");
  process.exit(1);
}

const url = `${API_URL}/auth/request-magic-link`;
console.log(`POST ${url}`);
console.log(`     email=${email}`);

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email }),
});

const json = await res.json().catch(() => null);
console.log(`status=${res.status}`);
console.log(JSON.stringify(json, null, 2));

if (!res.ok || json?.success === false) {
  process.exit(1);
}
