-- Gestão de utilizadores por administradores (sem Edge Function).
-- Aplica no mesmo projeto Supabase do VITE_SUPABASE_URL (ex.: ittmglvkympbyeowgucl).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  target_user_id uuid,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF new_password IS NULL OR length(new_password) < 6 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf', 10)),
    updated_at = now()
  WHERE id = target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_auth_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  admin_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF public.has_role(target_user_id, 'admin'::public.app_role) THEN
    SELECT count(*)::integer INTO admin_count
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role;

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_delete_last_admin';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
