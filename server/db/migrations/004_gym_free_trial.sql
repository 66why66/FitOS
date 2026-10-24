ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Give existing gyms a one-time 14-day transition period.
UPDATE gyms
SET trial_started_at = COALESCE(trial_started_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')
WHERE trial_ends_at IS NULL;
