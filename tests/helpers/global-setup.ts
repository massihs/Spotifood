import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recreates the test database schema from the committed migrations before the run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://spotifood:spotifood@localhost:5432/spotifood_test";
  if (!/test/.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);
  const pool = new Pool({ connectionString: url });
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
  );
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
