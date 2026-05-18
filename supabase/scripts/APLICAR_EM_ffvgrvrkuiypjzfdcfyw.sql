-- =============================================================================
-- PROJETO OBRIGATÓRIO: ffvgrvrkuiypjzfdcfyw
-- https://supabase.com/dashboard/project/ffvgrvrkuiypjzfdcfyw/sql/new
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Remove versões antigas (parâmetros uuid+text que a API REST pode não expor)
DROP FUNCTION IF EXISTS public.admin_set_user_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_delete_auth_user(uuid);
DROP FUNCTION IF EXISTS public.rpc_admin_set_password(jsonb);
DROP FUNCTION IF EXISTS public.rpc_admin_delete_user(jsonb);

-- Versão compatível com PostgREST: um único parâmetro jsonb "params"
CREATE OR REPLACE FUNCTION public.rpc_admin_set_password(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  target_user_id uuid := (params->>'target_user_id')::uuid;
  new_password text := params->>'new_password';
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
    RAISE EXCEPTION 'update_failed: %', SQLERRM USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  target_user_id uuid := (params->>'target_user_id')::uuid;
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
    RAISE EXCEPTION 'delete_failed: %', SQLERRM USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_set_password(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_password(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Verificação (aba Results): deve listar 2 linhas
-- SELECT proname FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('rpc_admin_set_password', 'rpc_admin_delete_user');
