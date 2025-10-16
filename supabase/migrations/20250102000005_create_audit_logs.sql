-- Create audit logs table for tracking changes
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'settings_change', 'strategy_change', 'position_change', 'login', 'logout'
  entity_type TEXT NOT NULL, -- 'user_settings', 'strategy', 'position', 'user'
  entity_id UUID, -- ID of the changed entity
  old_values JSONB, -- Previous values
  new_values JSONB, -- New values
  changed_fields TEXT[], -- Array of changed field names
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only view their own audit logs
CREATE POLICY "Users can view their own audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for faster queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs(action_type);

-- Create function to audit user_settings changes
CREATE OR REPLACE FUNCTION public.audit_user_settings_changes()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields TEXT[] := '{}';
  field_name TEXT;
BEGIN
  -- Compare old and new values to find changed fields
  FOR field_name IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
    IF to_jsonb(OLD)->>field_name IS DISTINCT FROM to_jsonb(NEW)->>field_name THEN
      changed_fields := array_append(changed_fields, field_name);
    END IF;
  END LOOP;
  
  -- Only create audit log if there are actual changes
  IF array_length(changed_fields, 1) > 0 THEN
    INSERT INTO public.audit_logs (
      user_id, 
      action_type, 
      entity_type, 
      entity_id,
      old_values, 
      new_values, 
      changed_fields
    ) VALUES (
      NEW.user_id, 
      'settings_change', 
      'user_settings', 
      NEW.id,
      to_jsonb(OLD), 
      to_jsonb(NEW), 
      changed_fields
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for user_settings changes
CREATE TRIGGER audit_user_settings_trigger
  AFTER UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_user_settings_changes();

-- Create function to audit strategy changes
CREATE OR REPLACE FUNCTION public.audit_strategy_changes()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields TEXT[] := '{}';
  field_name TEXT;
BEGIN
  -- Compare old and new values to find changed fields
  FOR field_name IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
    IF to_jsonb(OLD)->>field_name IS DISTINCT FROM to_jsonb(NEW)->>field_name THEN
      changed_fields := array_append(changed_fields, field_name);
    END IF;
  END LOOP;
  
  -- Only create audit log if there are actual changes
  IF array_length(changed_fields, 1) > 0 THEN
    INSERT INTO public.audit_logs (
      user_id, 
      action_type, 
      entity_type, 
      entity_id,
      old_values, 
      new_values, 
      changed_fields
    ) VALUES (
      NEW.user_id, 
      'strategy_change', 
      'strategy', 
      NEW.id,
      to_jsonb(OLD), 
      to_jsonb(NEW), 
      changed_fields
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for strategy changes
CREATE TRIGGER audit_strategy_trigger
  AFTER UPDATE ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_strategy_changes();

-- Create function to audit strategy creation
CREATE OR REPLACE FUNCTION public.audit_strategy_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, 
    action_type, 
    entity_type, 
    entity_id,
    old_values, 
    new_values, 
    changed_fields
  ) VALUES (
    NEW.user_id, 
    'strategy_created', 
    'strategy', 
    NEW.id,
    NULL, 
    to_jsonb(NEW), 
    ARRAY['created']
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for strategy creation
CREATE TRIGGER audit_strategy_creation_trigger
  AFTER INSERT ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_strategy_creation();

-- Create function to audit strategy deletion
CREATE OR REPLACE FUNCTION public.audit_strategy_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, 
    action_type, 
    entity_type, 
    entity_id,
    old_values, 
    new_values, 
    changed_fields
  ) VALUES (
    OLD.user_id, 
    'strategy_deleted', 
    'strategy', 
    OLD.id,
    to_jsonb(OLD), 
    NULL, 
    ARRAY['deleted']
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for strategy deletion
CREATE TRIGGER audit_strategy_deletion_trigger
  AFTER DELETE ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_strategy_deletion();

-- Add comments for documentation
COMMENT ON TABLE public.audit_logs IS 'Audit trail for all user actions and system changes';
COMMENT ON COLUMN public.audit_logs.action_type IS 'Type of action: settings_change, strategy_change, position_change, login, logout';
COMMENT ON COLUMN public.audit_logs.entity_type IS 'Type of entity being changed: user_settings, strategy, position, user';
COMMENT ON COLUMN public.audit_logs.changed_fields IS 'Array of field names that were changed';
