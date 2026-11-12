-- Migration: Delta Sync Support (updated_at triggers and indexes)
-- Supports local-first Scheduled Batch Synchronization for fast delta pulls (WHERE updated_at > last_synced_at)

-- 1. Generic trigger function to automatically bump updated_at on record mutation
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add updated_at column to any tables missing it
ALTER TABLE IF EXISTS time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS leave_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS leave_balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Attach updated_at triggers
DROP TRIGGER IF EXISTS trigger_set_updated_at_time_entries ON time_entries;
CREATE TRIGGER trigger_set_updated_at_time_entries
BEFORE UPDATE ON time_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_set_updated_at_leave_requests ON leave_requests;
CREATE TRIGGER trigger_set_updated_at_leave_requests
BEFORE UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_set_updated_at_leave_balances ON leave_balances;
CREATE TRIGGER trigger_set_updated_at_leave_balances
BEFORE UPDATE ON leave_balances
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_set_updated_at_employees ON employees;
CREATE TRIGGER trigger_set_updated_at_employees
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trigger_set_updated_at_notifications ON notifications;
CREATE TRIGGER trigger_set_updated_at_notifications
BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 4. B-Tree Indexes for rapid delta watermark queries: WHERE updated_at > :watermark
CREATE INDEX IF NOT EXISTS idx_time_entries_updated_at ON time_entries (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_updated_at ON leave_requests (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_balances_updated_at ON leave_balances (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON employees (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON notifications (user_id, updated_at DESC);

