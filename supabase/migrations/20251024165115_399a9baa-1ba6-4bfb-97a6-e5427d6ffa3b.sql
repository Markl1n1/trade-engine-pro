-- FIX: Update handle_new_user() function to use public.profiles instead of auth.users
-- This fixes remix issues where auth.users is empty during initial setup

-- Drop and recreate the function to use profiles table
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Assign 'admin' role to first user, 'user' role to others
  -- Use profiles table instead of auth.users for remix compatibility
  IF (SELECT COUNT(*) FROM public.profiles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any missing user roles using profiles table
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'user'::app_role
FROM public.profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.id IS NULL
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION public.handle_new_user() IS 'Auto-assigns roles on user signup. Uses profiles table for remix compatibility.';