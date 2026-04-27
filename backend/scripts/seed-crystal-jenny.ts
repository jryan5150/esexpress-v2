// One-off: seed Crystal + Jenny user accounts with NULL password_hash
// so they MUST use magic-link first login. Run from repo root:
//
//   cd /home/jryan/projects/work/esexpress-v2
//   set -a; source .env; set +a
//   tsx backend/scripts/seed-crystal-jenny.ts
//
// Idempotent — safe to re-run; ON CONFLICT skips existing rows.

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Sanity: don't accidentally write to the phantom Postgres-gywY service.
if (url.includes("interchange.proxy.rlwy.net")) {
  console.error("Refusing to write to phantom Postgres-gywY DB. Aborting.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const seeds = [
  {
    email: "crystal@esexpressllc.com",
    name: "Crystal",
    role: "admin",
  },
  {
    email: "jenny@esexpressllc.com",
    name: "Jenny",
    role: "admin",
  },
] as const;

async function main() {
  console.log("Seeding Crystal + Jenny accounts...");
  for (const s of seeds) {
    const existing = await sql`
      SELECT id, email, role FROM users WHERE lower(email) = lower(${s.email})
    `;
    if (existing.length > 0) {
      console.log(`  SKIP  ${s.email} — already exists (id=${existing[0].id})`);
      continue;
    }
    const inserted = await sql`
      INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
      VALUES (${s.email}, ${s.name}, ${s.role}, NULL, now(), now())
      RETURNING id, email, role
    `;
    console.log(
      `  CREATE id=${inserted[0].id} ${inserted[0].email} (role=${inserted[0].role}, password_hash=NULL → magic-link only)`,
    );
  }
  console.log();
  console.log("Done. They log in at /login → 'Email me a magic link'.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
