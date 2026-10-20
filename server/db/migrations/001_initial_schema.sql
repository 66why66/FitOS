
CREATE TABLE gyms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id)
);

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_unique
ON users (LOWER(email));

CREATE TABLE gym_users (
    gym_id BIGINT NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role VARCHAR(30) NOT NULL
        CHECK (role IN ('owner', 'admin', 'manager', 'receptionist', 'trainer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (gym_id, user_id)
);

CREATE TABLE members (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gym_id BIGINT NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    member_no VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    birth_date DATE,
    gender VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'blocked', 'archived')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (gym_id, id),
    UNIQUE (gym_id, member_no)
);

CREATE UNIQUE INDEX members_email_per_gym
ON members (gym_id, LOWER(email))
WHERE email IS NOT NULL;

CREATE TABLE plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gym_id BIGINT NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (gym_id, id),
    UNIQUE (gym_id, name)
);

CREATE TABLE memberships (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gym_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    plan_id BIGINT NOT NULL,
    starts_at DATE NOT NULL,
    ends_at DATE NOT NULL,
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'paused', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (gym_id, id),
    CHECK (ends_at >= starts_at),
    FOREIGN KEY (gym_id, member_id)
        REFERENCES members(gym_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (gym_id, plan_id)
        REFERENCES plans(gym_id, id) ON DELETE RESTRICT
);

CREATE INDEX memberships_member_idx
ON memberships (gym_id, member_id);

CREATE INDEX memberships_status_end_idx
ON memberships (gym_id, status, ends_at);

CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gym_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    membership_id BIGINT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    method VARCHAR(20) NOT NULL
        CHECK (method IN ('cash', 'card', 'bank_transfer', 'online', 'other')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'void')),
    reference VARCHAR(150),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (gym_id, member_id)
        REFERENCES members(gym_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (gym_id, membership_id)
        REFERENCES memberships(gym_id, id) ON DELETE RESTRICT
);

CREATE INDEX payments_gym_date_idx
ON payments (gym_id, created_at DESC);

CREATE INDEX payments_member_idx
ON payments (gym_id, member_id);

CREATE TABLE attendance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gym_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out TIMESTAMPTZ,
    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'qr', 'card', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (check_out IS NULL OR check_out >= check_in),
    FOREIGN KEY (gym_id, member_id)
        REFERENCES members(gym_id, id) ON DELETE RESTRICT
);

CREATE INDEX attendance_gym_date_idx
ON attendance (gym_id, check_in DESC);

CREATE INDEX attendance_member_idx
ON attendance (gym_id, member_id, check_in DESC);

CREATE UNIQUE INDEX attendance_one_open_visit
ON attendance (gym_id, member_id)
WHERE check_out IS NULL;

