import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,

});

const base = 'http://127.0.0.1:3001';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);

const accounts = [
  {
    fullName: 'FitOS Test Owner A',
    email: `test-a-${suffix}@fitos.invalid`,
    password: `FitOS-Test-A-${suffix}!`,
    gymName: `Test Gym A ${suffix}`,
    gymSlug: `test-gym-a-${suffix}`,
  },
  {
    fullName: 'FitOS Test Owner B',
    email: `test-b-${suffix}@fitos.invalid`,
    password: `FitOS-Test-B-${suffix}!`,
    gymName: `Test Gym B ${suffix}`,
    gymSlug: `test-gym-b-${suffix}`,
  },
];

const createdUsers = [];

function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`PASS: ${message}`);
}

async function request(path, method = 'GET', body, cookie) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawCookie = response.headers.get('set-cookie');
  const newCookie = rawCookie?.match(/fitos\.sid=([^;]+)/)?.[0];

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
    cookie: newCookie || cookie,
  };
}

async function main() {
  const health = await request('/api/health');
  assert(health.status === 200, 'API and database health');

  const unauthenticated = await request('/api/auth/me');
  assert(unauthenticated.status === 401, 'Unauthenticated access rejected');

  const sessions = [];

  for (const account of accounts) {
    const result = await request('/api/auth/register', 'POST', account);

    assert(result.status === 201, 'Owner registration and gym creation');

    const userId = result.data.user.id;
    const gymId = result.data.gym.id;

    createdUsers.push(userId);
    sessions.push({ cookie: result.cookie, userId, gymId });

    assert(result.data.role === 'owner', 'Owner role assigned');
    assert(Boolean(result.cookie), 'Persistent session cookie issued');

    const me = await request('/api/auth/me', 'GET', undefined, result.cookie);
    assert(me.status === 200, 'Authenticated user profile');

    const gym = await request('/api/gym', 'GET', undefined, result.cookie);
    assert(gym.status === 200, 'Access to own gym');

    const admin = await request('/api/gym/admin', 'GET', undefined, result.cookie);
    assert(admin.status === 200, 'Owner admin permission');
  }

  const crossTenant = await request(
    '/api/auth/select-gym',
    'POST',
    { gymId: sessions[1].gymId },
    sessions[0].cookie
  );

  assert(crossTenant.status === 403, 'Cross-tenant gym selection rejected');

  const duplicate = await request(
    '/api/auth/register',
    'POST',
    accounts[0],
  );

  assert(duplicate.status === 409, 'Duplicate registration rejected');

  const invalidLogin = await request('/api/auth/login', 'POST', {
    email: accounts[0].email,
    password: 'Wrong-Password-123!',
  });

  assert(invalidLogin.status === 401, 'Invalid password rejected');

  const login = await request('/api/auth/login', 'POST', {
    email: accounts[0].email,
    password: accounts[0].password,
  });

  assert(login.status === 200, 'Valid login');

  const logout = await request(
    '/api/auth/logout',
    'POST',
    {},
    login.cookie
  );

  assert(logout.status === 200, 'Logout');

  const afterLogout = await request(
    '/api/auth/me',
    'GET',
    undefined,
    login.cookie
  );

  assert(afterLogout.status === 401, 'Session invalidated after logout');

  console.log('\nALL PHASE 1 SMOKE TESTS PASSED');
}

try {
  await main();
} catch (error) {
  console.error('\nTEST ERROR:', error.message);
  process.exitCode = 1;
} finally {
  if (createdUsers.length) {
    try {
      await pool.query(
        `DELETE FROM user_sessions
         WHERE sess::text LIKE ANY($1::text[])`,
        [createdUsers.map(id => `%${id}%`)]
      );

      await pool.query(
        'DELETE FROM gym_users WHERE user_id = ANY($1::bigint[])',
        [createdUsers]
      );

      await pool.query(
        'DELETE FROM users WHERE id = ANY($1::bigint[])',
        [createdUsers]
      );

      await pool.query(
        'DELETE FROM gyms WHERE slug LIKE $1',
        [`test-gym-%-${suffix}`]
      );

      console.log('TEST DATA CLEANED');
    } catch (error) {
      console.error('CLEANUP WARNING:', error.message);
      process.exitCode = 1;
    }
  }

  await pool.end();
}
