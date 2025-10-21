-- Create trigger function to auto-assign roles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Assign 'admin' role to first user, 'user' role to others
  IF (SELECT COUNT(*) FROM auth.users) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users to auto-assign roles
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users without roles (assign 'user' role)
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'user'::app_role
FROM auth.users au
LEFT JOIN user_roles ur ON au.id = ur.user_id
WHERE ur.id IS NULL
ON CONFLICT DO NOTHING;