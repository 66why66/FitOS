import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, 'migrations');
const client = await pool.connect();

let locked = false;

try {
  await client.query('SELECT pg_advisory_lock($1)', [731942]);
  locked = true;

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  const applied = await client.query(
    'SELECT version FROM schema_migrations'
  );

  const appliedVersions = new Set(
    applied.rows.map(row => row.version)
  );

  for (const file of files) {
    if (appliedVersions.has(file)) {
      console.log(`SKIPPED: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(
      path.join(migrationsDir, file),
      'utf8'
    );

    console.log(`APPLYING: ${file}`);

    await client.query('BEGIN');

    try {
      await client.query(sql);

      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file]
      );

      await client.query('COMMIT');

      console.log(`APPLIED: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Database migrations completed.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [731942]);
    } catch {}
  }

  client.release();
  await pool.end();
}
