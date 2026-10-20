import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const API = 'http://127.0.0.1:3001';
const suffix = randomBytes(6).toString('hex');
const password = 'FitOS-Role-Test-2026!';
const roles = ['owner', 'admin', 'manager', 'receptionist', 'trainer'];

const expected = {
  owner:        [200, 200, 200],
  admin:        [200, 200, 200],
  manager:      [200, 200, 403],
  receptionist: [200, 403, 403],
  trainer:      [200, 403, 403],
};

const routes = [
  '/api/gym',
  '/api/gym/management',
  '/api/gym/admin',
];

let gymId = null;
const userIds = [];
let failures = 0;

async function cleanup() {
  if (userIds.length) {
    await pool.query(
      `DELETE FROM user_sessions
       WHERE sess->>'userId' = ANY($1::text[])`,
      [userIds.map(String)]
    );
  }

  if (gymId !== null) {
    await pool.query('DELETE FROM gym_users WHERE gym_id = $1', [gymId]);

    if (userIds.length) {
      await pool.query(
        'DELETE FROM users WHERE id = ANY($1::bigint[])',
        [userIds]
      );
    }

    await pool.query('DELETE FROM gyms WHERE id = $1', [gymId]);
  }
}

try {
  console.log('===== CREATE ISOLATED TEST DATA =====');

  const gym = await pool.query(
    `INSERT INTO gyms (name, slug, timezone, currency)
     VALUES ($1, $2, 'UTC', 'USD')
     RETURNING id`,
    [`FitOS Role Test ${suffix}`, `fitos-role-${suffix}`]
  );

  gymId = gym.rows[0].id;

  const passwordHash = await bcrypt.hash(password, 4);

  for (const role of roles) {
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`${role}-${suffix}@fitos-test.invalid`, passwordHash, `Test ${role}`]
    );

    const userId = user.rows[0].id;
    userIds.push(userId);

    await pool.query(
      `INSERT INTO gym_users (gym_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [gymId, userId, role]
    );
  }

  console.log('PASS: One isolated gym and five role accounts created');

  console.log('\n===== ROLE PERMISSION MATRIX =====');

  for (const role of roles) {
    const email = `${role}-${suffix}@fitos-test.invalid`;

    const login = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (login.status !== 200) {
      throw new Error(`${role}: login failed with HTTP ${login.status}`);
    }

    const cookie = login.headers.get('set-cookie')?.split(';')[0];

    if (!cookie) {
      throw new Error(`${role}: session cookie was not issued`);
    }

    console.log(`\nROLE: ${role}`);

    for (let i = 0; i < routes.length; i++) {
      const response = await fetch(`${API}${routes[i]}`, {
        headers: { Cookie: cookie },
      });

      const expectedStatus = expected[role][i];
      const passed = response.status === expectedStatus;

      console.log(
        `${passed ? 'PASS' : 'FAIL'}: ${routes[i]} ` +
        `expected=${expectedStatus} actual=${response.status}`
      );

      if (!passed) failures++;
    }

    const logout = await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    if (logout.status !== 200) {
      throw new Error(`${role}: logout failed with HTTP ${logout.status}`);
    }

    console.log(`PASS: ${role} logout`);
  }

  console.log('\n===== RESULT =====');

  if (failures > 0) {
    throw new Error(`${failures} permission checks failed`);
  }

  console.log('ALL 15 ROLE PERMISSION CHECKS PASSED');
} catch (error) {
  console.error('\nTEST FAILED:', error.message);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
    console.log('TEST DATA CLEANED');
  } catch (error) {
    console.error('CLEANUP ERROR:', error.message);
    process.exitCode = 1;
  }

  await pool.end();
}
