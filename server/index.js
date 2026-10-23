import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import {
  securityHeaders,
  authLimiter,
  allowedOrigins,
} from './config/security.js';

const { Pool } = pg;
const PgSession = connectPgSimple(session);

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error('DATABASE_URL and SESSION_SECRET are required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

});

pool.on('error', error => {
  console.error('Database pool error:', error.message);
});

const app = express();

// Render terminates HTTPS at its proxy.
app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(securityHeaders);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Protect browser requests against untrusted origins.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');

    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({
        success: false,
        error: 'Origin not allowed',
      });
    }
  }

  next();
});

app.use(session({
  name: 'fitos.sid',
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  },
}));

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const regenerateSession = req =>
  new Promise((resolve, reject) => {
    req.session.regenerate(error =>
      error ? reject(error) : resolve()
    );
  });

const saveSession = req =>
  new Promise((resolve, reject) => {
    req.session.save(error =>
      error ? reject(error) : resolve()
    );
  });

const destroySession = req =>
  new Promise((resolve, reject) => {
    req.session.destroy(error =>
      error ? reject(error) : resolve()
    );
  });

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).refine(
    value => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must not exceed 72 bytes'
  ),
  gymName: z.string().trim().min(2).max(150),
  gymSlug: z.string().trim().min(2).max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  timezone: z.string().trim().min(1).max(80).default('UTC'),
  currency: z.string().trim().length(3).default('USD'),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const gymSchema = z.object({
  gymId: z.coerce.number().int().positive(),
});

function validationError(result) {
  return result.error.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

// Health
app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');

  res.json({
    success: true,
    service: 'FitOS API',
    database: 'connected',
  });
}));

// Owner registration + gym creation
app.post('/api/auth/register', authLimiter, asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validationError(parsed),
    });
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(data.password, 12);

  const baseSlug = data.gymSlug ||
    data.gymName.toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);

  if (!baseSlug || baseSlug.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'A valid gymSlug is required for this gym name.',
    });
  }

  const client = await pool.connect();
  let user;
  let gym;

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, is_active`,
      [email, passwordHash, data.fullName]
    );

    user = userResult.rows[0];

    const gymResult = await client.query(
      `INSERT INTO gyms (name, slug, timezone, currency)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, timezone, currency, status`,
      [data.gymName, baseSlug, data.timezone, data.currency.toUpperCase()]
    );

    gym = gymResult.rows[0];

    await client.query(
      `INSERT INTO gym_users (gym_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [gym.id, user.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Email or gym slug already exists.',
      });
    }

    throw error;
  } finally {
    client.release();
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.selectedGymId = gym.id;
  await saveSession(req);

  res.status(201).json({
    success: true,
    message: 'Gym and owner account created.',
    user,
    gym,
    role: 'owner',
  });
}));

// Login
app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email or password format.',
    });
  }

  const email = parsed.data.email.toLowerCase();

  const result = await pool.query(
    `SELECT id, email, password_hash, full_name, is_active
     FROM users
     WHERE LOWER(email) = $1
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0];

  if (
    !user ||
    !user.is_active ||
    !(await bcrypt.compare(parsed.data.password, user.password_hash))
  ) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.',
    });
  }

  // One-time platform-owner bootstrap, enabled only after the DB migration.
  const platformOwnerEmail = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (platformOwnerEmail && email === platformOwnerEmail) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [72819461]);
      const existingOwner = await client.query(
        'SELECT user_id FROM platform_owners LIMIT 1'
      );
      if (existingOwner.rows.length === 0) {
        const promoted = await client.query(
          'INSERT INTO platform_owners (user_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING user_id',
          [user.id]
        );
        if (promoted.rows.length) {
          await client.query(
            `INSERT INTO platform_audit_log (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'platform.owner.bootstrap', 'user', $2, '{}'::jsonb)`,
            [user.id, String(user.id)]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const gymsResult = await pool.query(
    `SELECT g.id, g.name, g.slug, g.timezone, g.currency,
            g.status, gu.role
     FROM gym_users gu
     JOIN gyms g ON g.id = gu.gym_id
     WHERE gu.user_id = $1 AND g.status = 'active'
     ORDER BY g.name`,
    [user.id]
  );

  if (gymsResult.rows.length === 0) {
    return res.status(403).json({
      success: false,
      error: 'No active gym access is available.',
    });
  }

  await regenerateSession(req);
  req.session.userId = user.id;

  if (gymsResult.rows.length === 1) {
    req.session.selectedGymId = gymsResult.rows[0].id;
  }

  await saveSession(req);

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    },
    gyms: gymsResult.rows,
    selectedGymId: req.session.selectedGymId || null,
  });
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }

  next();
};

// Verify gym membership on every protected gym request.
const requireGym = asyncHandler(async (req, res, next) => {
  if (!req.session.selectedGymId) {
    return res.status(409).json({
      success: false,
      error: 'Select a gym first.',
    });
  }

  const result = await pool.query(
    `SELECT g.id, g.name, g.slug, g.timezone, g.currency,
            g.status, gu.role
     FROM gym_users gu
     JOIN gyms g ON g.id = gu.gym_id
     WHERE gu.user_id = $1 AND gu.gym_id = $2
       AND g.status = 'active'
     LIMIT 1`,
    [req.session.userId, req.session.selectedGymId]
  );

  if (!result.rows[0]) {
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this gym.',
    });
  }

  req.gym = result.rows[0];
  req.gymId = result.rows[0].id;
  req.role = result.rows[0].role;

  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.role)) {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions.',
    });
  }

  next();
};



const requirePlatformOwner = asyncHandler(async (req, res, next) => {
  const result = await pool.query(
    'SELECT 1 FROM platform_owners WHERE user_id = $1 LIMIT 1',
    [req.session.userId]
  );
  if (!result.rows.length) {
    return res.status(403).json({
      success: false,
      error: 'Platform owner access required.',
    });
  }
  next();
});

const writePlatformAudit = (actorId, action, targetType, targetId, details = {}) =>
  pool.query(
    `INSERT INTO platform_audit_log
       (actor_user_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, String(targetId), JSON.stringify(details)]
  );

const memberCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.preprocess(
    value => value === '' ? undefined : value,
    z.string().trim().email().max(255).optional()
  ),
  phone: z.preprocess(
    value => value === '' ? undefined : value,
    z.string().trim().min(3).max(40).optional()
  ),
});

// Dashboard values are calculated from this gym's database records.
app.get('/api/gym/dashboard', requireAuth, requireGym, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int
        FROM members
        WHERE gym_id = $1 AND status <> 'archived') AS total_members,

       (SELECT COUNT(*)::int
        FROM memberships
        WHERE gym_id = $1
          AND status = 'active'
          AND starts_at <= (NOW() AT TIME ZONE $2)::date
          AND ends_at >= (NOW() AT TIME ZONE $2)::date) AS active_memberships,

       (SELECT COUNT(*)::int
        FROM attendance
        WHERE gym_id = $1
          AND check_in >= (
            date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
          )
          AND check_in < (
            (date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day')
            AT TIME ZONE $2
          )) AS today_attendance,

       (SELECT COALESCE(SUM(amount_minor), 0)::text
        FROM payments
        WHERE gym_id = $1
          AND status = 'paid'
          AND paid_at >= (
            date_trunc('month', NOW() AT TIME ZONE $2) AT TIME ZONE $2
          )
          AND paid_at < (
            (date_trunc('month', NOW() AT TIME ZONE $2) + INTERVAL '1 month')
            AT TIME ZONE $2
          )) AS monthly_revenue_minor`,
    [req.gymId, req.gym.timezone]
  );

  res.json({
    success: true,
    gym: {
      id: req.gym.id,
      name: req.gym.name,
      timezone: req.gym.timezone,
      currency: req.gym.currency,
      role: req.role,
    },
    stats: result.rows[0],
  });
}));

// Recent members are always scoped to the authenticated gym.
app.get('/api/gym/members', requireAuth, requireGym, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, member_no, first_name, last_name, email, phone,
            status, created_at
     FROM members
     WHERE gym_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.gymId]
  );

  res.json({ success: true, members: result.rows });
}));

app.post('/api/gym/members', requireAuth, requireGym, asyncHandler(async (req, res) => {
  const parsed = memberCreateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Please check the member details.',
      details: validationError(parsed),
    });
  }

  const data = parsed.data;
  const memberNo = 'MEM-' + randomBytes(5).toString('hex').toUpperCase();

  try {
    const result = await pool.query(
      `INSERT INTO members
         (gym_id, member_no, first_name, last_name, email, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, member_no, first_name, last_name, email, phone,
                 status, created_at`,
      [
        req.gymId,
        memberNo,
        data.firstName,
        data.lastName,
        data.email?.toLowerCase() || null,
        data.phone || null,
      ]
    );

    res.status(201).json({
      success: true,
      member: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A member with these details may already exist.',
      });
    }
    throw error;
  }
}));


// Platform owner APIs: every route is protected by a database-backed owner check.
app.get('/api/platform/dashboard', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM gyms) AS total_gyms,
      (SELECT COUNT(*)::int FROM gyms WHERE status = 'active') AS active_gyms,
      (SELECT COUNT(*)::int FROM gyms WHERE status = 'suspended') AS suspended_gyms,
      (SELECT COUNT(*)::int FROM platform_plans) AS total_plans,
      (SELECT COUNT(*)::int FROM gym_subscriptions WHERE status = 'active'
        AND (ends_at IS NULL OR ends_at >= NOW())
        AND (starts_at IS NULL OR starts_at <= NOW())) AS active_subscriptions,
      (SELECT COUNT(*)::int FROM gym_subscriptions
        WHERE status IN ('expired', 'past_due')) AS attention_subscriptions
  `);
  res.json({ success: true, dashboard: result.rows[0] });
}));

app.get('/api/platform/gyms', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT g.id, g.name, g.slug, g.status, g.currency, g.timezone, g.created_at,
      (SELECT u.email FROM gym_users gu JOIN users u ON u.id = gu.user_id
       WHERE gu.gym_id = g.id AND gu.role = 'owner'
       ORDER BY gu.created_at LIMIT 1) AS owner_email,
      sub.status AS subscription_status,
      sub.ends_at AS subscription_ends_at,
      sub.plan_name
    FROM gyms g
    LEFT JOIN LATERAL (
      SELECT gs.status, gs.ends_at, pp.name AS plan_name
      FROM gym_subscriptions gs
      JOIN platform_plans pp ON pp.id = gs.plan_id
      WHERE gs.gym_id = g.id
      ORDER BY gs.created_at DESC
      LIMIT 1
    ) sub ON TRUE
    ORDER BY g.created_at DESC
  `);
  res.json({ success: true, gyms: result.rows });
}));

app.patch('/api/platform/gyms/:id/status', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid gym ID.' });
  }
  const parsed = z.object({
    status: z.enum(['active', 'suspended', 'inactive']),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid gym status.' });
  }

  const result = await pool.query(
    'UPDATE gyms SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, status',
    [parsed.data.status, req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ success: false, error: 'Gym not found.' });
  }
  await writePlatformAudit(
    req.session.userId, 'platform.gym.status_changed', 'gym',
    req.params.id, { status: parsed.data.status }
  );
  res.json({ success: true, gym: result.rows[0] });
}));

app.get('/api/platform/plans', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, description, price_minor, currency, duration_days, is_active, created_at FROM platform_plans ORDER BY price_minor, name'
  );
  res.json({ success: true, plans: result.rows });
}));

app.post('/api/platform/plans', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(2000).optional().default(''),
    priceMinor: z.number().int().min(0).max(100000000000),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional().default('USD'),
    durationDays: z.number().int().min(1).max(3650),
    isActive: z.boolean().optional().default(true),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid plan details.' });
  }

  const p = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO platform_plans
        (name, description, price_minor, currency, duration_days, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, price_minor, currency, duration_days, is_active`,
      [p.name, p.description, p.priceMinor, p.currency.toUpperCase(), p.durationDays, p.isActive]
    );
    await writePlatformAudit(req.session.userId, 'platform.plan.created', 'plan', result.rows[0].id, {
      name: p.name, priceMinor: p.priceMinor, currency: p.currency.toUpperCase(),
      durationDays: p.durationDays
    });
    res.status(201).json({ success: true, plan: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'A plan with this name already exists.' });
    }
    throw error;
  }
}));

app.post('/api/platform/gyms/:id/subscription', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid gym ID.' });
  }
  const parsed = z.object({
    planId: z.number().int().positive(),
    status: z.enum(['pending', 'active', 'past_due', 'cancelled', 'expired']).optional().default('active'),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  }).refine(v => !v.startsAt || !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt), {
    message: 'End date must not be before start date.'
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid subscription details.' });
  }

  const p = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const gym = await client.query('SELECT id FROM gyms WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!gym.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Gym not found.' });
    }
    const plan = await client.query(
      'SELECT id FROM platform_plans WHERE id = $1 AND is_active = TRUE',
      [p.planId]
    );
    if (!plan.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Active plan not found.' });
    }
    const result = await client.query(
      `INSERT INTO gym_subscriptions (gym_id, plan_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, gym_id, plan_id, status, starts_at, ends_at, created_at`,
      [req.params.id, p.planId, p.status, p.startsAt ?? null, p.endsAt ?? null]
    );
    await client.query(
      `INSERT INTO platform_audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'platform.subscription.assigned', 'gym', $2, $3::jsonb)`,
      [req.session.userId, String(req.params.id), JSON.stringify({
        subscriptionId: result.rows[0].id, planId: p.planId, status: p.status
      })]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, subscription: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/platform/audit-log', requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const parsed = z.coerce.number().int().min(1).max(200).optional().safeParse(req.query.limit);
  const limit = parsed.success && parsed.data ? parsed.data : 50;
  const result = await pool.query(
    `SELECT id, actor_user_id, action, target_type, target_id, details, created_at
     FROM platform_audit_log ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ success: true, events: result.rows });
}));

// Current user and accessible gyms
app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.is_active,
            g.id AS gym_id, g.name AS gym_name,
            g.slug, gu.role
     FROM users u
     JOIN gym_users gu ON gu.user_id = u.id
     JOIN gyms g ON g.id = gu.gym_id
     WHERE u.id = $1 AND g.status = 'active'
     ORDER BY g.name`,
    [req.session.userId]
  );

  if (!result.rows.length) {
    return res.status(403).json({
      success: false,
      error: 'No active gym access.',
    });
  }

  res.json({
    success: true,
    user: {
      id: result.rows[0].id,
      email: result.rows[0].email,
      fullName: result.rows[0].full_name,
    },
    gyms: result.rows.map(row => ({
      id: row.gym_id,
      name: row.gym_name,
      slug: row.slug,
      role: row.role,
    })),
    selectedGymId: req.session.selectedGymId || null,
  });
}));

// Select a gym; membership is always verified against the database.
app.post('/api/auth/select-gym', requireAuth, asyncHandler(async (req, res) => {
  const parsed = gymSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid gym ID.',
    });
  }

  const result = await pool.query(
    `SELECT g.id, g.name, g.slug, g.timezone, g.currency, gu.role
     FROM gym_users gu
     JOIN gyms g ON g.id = gu.gym_id
     WHERE gu.user_id = $1 AND gu.gym_id = $2
       AND g.status = 'active'
     LIMIT 1`,
    [req.session.userId, parsed.data.gymId]
  );

  if (!result.rows[0]) {
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this gym.',
    });
  }

  req.session.selectedGymId = result.rows[0].id;
  await saveSession(req);

  res.json({
    success: true,
    gym: result.rows[0],
  });
}));

// Current gym - tenant context comes only from the verified session.
app.get('/api/gym', requireAuth, requireGym, (req, res) => {
  res.json({
    success: true,
    gym: req.gym,
    role: req.role,
  });
});

// Management-only route
app.get(
  '/api/gym/management',
  requireAuth,
  requireGym,
  requireRole('owner', 'admin', 'manager'),
  (req, res) => {
    res.json({
      success: true,
      gymId: req.gymId,
      message: 'Management access granted.',
    });
  }
);

// Admin-only route
app.get(
  '/api/gym/admin',
  requireAuth,
  requireGym,
  requireRole('owner', 'admin'),
  (req, res) => {
    res.json({
      success: true,
      gymId: req.gymId,
      message: 'Admin access granted.',
    });
  }
);

// Logout
app.post('/api/auth/logout', requireAuth, asyncHandler(async (req, res) => {
  await destroySession(req);

  res.clearCookie('fitos.sid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
}));

const serverDir = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(serverDir, '../dist')));

// Not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error('API error:', error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : error.message,
  });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`FitOS API running on port ${PORT}`);
});

async function shutdown() {
  console.log('Shutting down FitOS API...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
