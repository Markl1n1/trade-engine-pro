-- Add missing status column to strategies table
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' NOT NULL;

-- Add missing role column to user_roles table
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user' NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
CREATE INDEX IF NOT EXISTS idx_strategies_user_status ON strategies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Add helpful comments
COMMENT ON COLUMN strategies.status IS 'Strategy status: active, paused, draft, or archived';
COMMENT ON COLUMN user_roles.role IS 'User role: admin, moderator, or user';