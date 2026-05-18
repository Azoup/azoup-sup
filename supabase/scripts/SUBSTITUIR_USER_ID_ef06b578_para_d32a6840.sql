-- =============================================================================
-- Substituir utilizador — ittmglvkympbyeowgucl
-- DE: ef06b578-6d1c-477c-9d14-5f969d1800e2
-- PARA: d32a6840-3715-4c40-93e5-269317f3609d
--
-- https://supabase.com/dashboard/project/ittmglvkympbyeowgucl/sql/new
-- Só atualiza tabelas/colunas que existem no seu banco.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  old_id uuid := 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  new_id uuid := 'd32a6840-3715-4c40-93e5-269317f3609d';
  r record;
  sql text;
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = new_id) THEN
    RAISE EXCEPTION 'O ID novo (%) não existe em auth.users.', new_id;
  END IF;

  RAISE NOTICE 'A migrar referências de % para %...', old_id, new_id;

  -- user_roles: evitar duplicado (user_id, role)
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.user_roles ur_old
      WHERE ur_old.user_id = $1
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur_new
          WHERE ur_new.user_id = $2 AND ur_new.role = ur_old.role
        )
    $q$ USING old_id, new_id;
    EXECUTE 'UPDATE public.user_roles SET user_id = $2 WHERE user_id = $1' USING old_id, new_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'user_roles: % linha(s)', n;
  END IF;

  -- user_permissions: evitar duplicado (user_id, permission_key)
  IF to_regclass('public.user_permissions') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.user_permissions up_old
      WHERE up_old.user_id = $1
        AND EXISTS (
          SELECT 1 FROM public.user_permissions up_new
          WHERE up_new.user_id = $2 AND up_new.permission_key = up_old.permission_key
        )
    $q$ USING old_id, new_id;
    EXECUTE 'UPDATE public.user_permissions SET user_id = $2 WHERE user_id = $1' USING old_id, new_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'user_permissions: % linha(s)', n;
  END IF;

  -- profiles
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = new_id) THEN
      DELETE FROM public.profiles WHERE id = old_id;
      RAISE NOTICE 'profiles: perfil antigo removido (novo já existe)';
    ELSE
      UPDATE public.profiles SET id = new_id WHERE id = old_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'profiles: % linha(s) atualizada(s)', n;
    END IF;
  END IF;

  -- public: todas as colunas uuid de referência a utilizador
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.udt_name = 'uuid'
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id'
      )
      AND to_regclass(format('%I.%I', c.table_schema, c.table_name)) IS NOT NULL
      AND NOT (c.table_name = 'profiles' AND c.column_name = 'id')
  LOOP
    sql := format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      r.table_schema, r.table_name, r.column_name, r.column_name
    );
    EXECUTE sql USING new_id, old_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '%.%: % linha(s)', r.table_schema, r.table_name || '.' || r.column_name, n;
    END IF;
  END LOOP;

  -- storage.objects
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner'
    ) THEN
      EXECUTE 'UPDATE storage.objects SET owner = $1 WHERE owner = $2' USING new_id, old_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE 'storage.objects.owner: % linha(s)', n; END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner_id'
    ) THEN
      EXECUTE 'UPDATE storage.objects SET owner_id = $1 WHERE owner_id = $2' USING new_id, old_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE 'storage.objects.owner_id: % linha(s)', n; END IF;
    END IF;
  END IF;

  -- auth (só tabelas que existem)
  FOR r IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'auth'
      AND t.table_name IN (
        'identities', 'sessions', 'refresh_tokens', 'mfa_factors', 'one_time_tokens'
      )
      AND to_regclass(format('%I.%I', t.table_schema, t.table_name)) IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = r.table_schema
        AND table_name = r.table_name
        AND column_name = 'user_id'
    ) THEN
      sql := format(
        'UPDATE %I.%I SET user_id = $1 WHERE user_id = $2',
        r.table_schema, r.table_name
      );
      EXECUTE sql USING new_id, old_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        RAISE NOTICE '%.%: % linha(s)', r.table_schema, r.table_name, n;
      END IF;
    END IF;
  END LOOP;

  -- remove conta antiga
  DELETE FROM auth.users WHERE id = old_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'auth.users: % conta(s) antiga(s) removida(s)', n;

  RAISE NOTICE 'Concluído.';
END $$;

COMMIT;

-- Verificação (ignora tabelas inexistentes)
DO $$
DECLARE
  old_id uuid := 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  r record;
  sql text;
  cnt bigint;
BEGIN
  RAISE NOTICE '--- Verificação (deve ser 0 em todas) ---';
  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT count(*) INTO cnt FROM auth.users WHERE id = old_id;
    RAISE NOTICE 'auth.users: %', cnt;
  END IF;
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema IN ('public', 'auth')
      AND c.udt_name = 'uuid'
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id', 'id'
      )
      AND to_regclass(format('%I.%I', c.table_schema, c.table_name)) IS NOT NULL
  LOOP
    sql := format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      r.table_schema, r.table_name, r.column_name
    );
    EXECUTE sql INTO cnt USING old_id;
    IF cnt > 0 THEN
      RAISE NOTICE '%.%: % restante(s)', r.table_schema, r.table_name || '.' || r.column_name, cnt;
    END IF;
  END LOOP;
END $$;
