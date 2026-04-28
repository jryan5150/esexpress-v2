// Force a user to re-authenticate by setting tokens_invalidated_at = now().
// The authenticate guard will reject any JWT issued before this timestamp,
// so the user is bounced to /login on their next request.
//
// Use to push fresh release content (WhatsNew, layout changes, etc.) to a
// specific user without waiting for the natural 24h JWT expiry.
//
// Run from repo root:
//   set -a; source .env; set +a
//   tsx backend/scripts/force-relogin.ts <email>
//   tsx backend/scripts/force-relogin.ts <email> --revert   # clears the timestamp

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (url.includes("interchange.proxy.rlwy.net"))
    throw new Error("Refusing phantom DB");

  const email = process.argv[2];
  const revert = process.argv.includes("--revert");
  if (!email) {
    console.error(
      "Usage: tsx backend/scripts/force-relogin.ts <email> [--revert]",
    );
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  const before = (await sql`
    SELECT id, email, tokens_invalidated_at::text AS tia
    FROM users WHERE LOWER(email) = LOWER(${email})
  `) as unknown as Array<{ id: number; email: string; tia: string | null }>;
  if (before.length === 0) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(
    `Found user id=${before[0].id} email=${before[0].email} current invalidated_at=${before[0].tia ?? "(null)"}`,
  );

  if (revert) {
    await sql`UPDATE users SET tokens_invalidated_at = NULL WHERE id = ${before[0].id}`;
    console.log(`Cleared tokens_invalidated_at for ${email}`);
  } else {
    await sql`UPDATE users SET tokens_invalidated_at = NOW() WHERE id = ${before[0].id}`;
    console.log(
      `Set tokens_invalidated_at = NOW() for ${email}. Their next request will be 401-rejected and they'll be bounced to /login.`,
    );
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
