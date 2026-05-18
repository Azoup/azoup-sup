-- =============================================================================
-- EXECUTE APENAS NO PROJETO: ffvgrvrkuiypjzfdcfyw
-- URL do painel: https://supabase.com/dashboard/project/ffvgrvrkuiypjzfdcfyw/sql/new
--
-- NÃO execute no projeto ittmglvkympbyeowgucl (é outro projeto / outra base).
-- O app (VITE_SUPABASE_URL) aponta para ffvgrvrkuiypjzfdcfyw.
-- =============================================================================

-- Verificação (opcional): depois de aplicar, deve listar 2 funções:
-- SELECT proname FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND proname IN ('admin_set_user_password', 'admin_delete_auth_user');

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
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF new_password IS NULL OR length(new_password) < 6 THEN
    RAISE EXCEPTION 'weak_password' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf', 10)),
    updated_at = now()
  WHERE id = target_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%unauthorized%' OR SQLERRM LIKE '%forbidden%' OR SQLERRM LIKE '%weak_password%'
      OR SQLERRM LIKE '%user_not_found%' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'update_failed: %', SQLERRM USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF public.has_role(target_user_id, 'admin'::public.app_role) THEN
    SELECT count(*)::integer INTO admin_count
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role;

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_delete_last_admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%unauthorized%' OR SQLERRM LIKE '%forbidden%' OR SQLERRM LIKE '%cannot_delete%'
      OR SQLERRM LIKE '%user_not_found%' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'delete_failed: %', SQLERRM USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
