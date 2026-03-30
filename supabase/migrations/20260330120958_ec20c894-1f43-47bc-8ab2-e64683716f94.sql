
-- Assign roles to any existing users who don't have one yet
-- First user gets admin, rest get 'user'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') 
       THEN 'admin'::app_role 
       ELSE 'user'::app_role 
  END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u.id)
ORDER BY u.created_at ASC;

-- Create profiles for existing users who don't have one
INSERT INTO public.profiles (id, display_name)
SELECT u.id, split_part(u.email, '@', 1)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = u.id);
