-- =============================================================================
-- Substituir utilizador — ittmglvkympbyeowgucl
-- DE: ef06b578-6d1c-477c-9d14-5f969d1800e2
-- PARA: d32a6840-3715-4c40-93e5-269317f3609d
--
-- https://supabase.com/dashboard/project/ittmglvkympbyeowgucl/sql/new
-- Compatível com colunas uuid, text e varchar.
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
      WHERE ur_old.user_id = $1::uuid
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur_new
          WHERE ur_new.user_id = $2::uuid AND ur_new.role = ur_old.role
        )
    $q$ USING old_id, new_id;
    EXECUTE 'UPDATE public.user_roles SET user_id = $2::uuid WHERE user_id = $1::uuid'
      USING old_id, new_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'user_roles: % linha(s)', n;
  END IF;

  -- user_permissions: evitar duplicado (user_id, permission_key)
  IF to_regclass('public.user_permissions') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.user_permissions up_old
      WHERE up_old.user_id = $1::uuid
        AND EXISTS (
          SELECT 1 FROM public.user_permissions up_new
          WHERE up_new.user_id = $2::uuid AND up_new.permission_key = up_old.permission_key
        )
    $q$ USING old_id, new_id;
    EXECUTE 'UPDATE public.user_permissions SET user_id = $2::uuid WHERE user_id = $1::uuid'
      USING old_id, new_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'user_permissions: % linha(s)', n;
  END IF;

  -- profiles: fundir nome/foto (não apagar dados do perfil antigo)
  IF to_regclass('public.profiles') IS NOT NULL THEN
    INSERT INTO public.profiles (id, display_name, photo_url)
    SELECT new_id, p.display_name, p.photo_url
    FROM public.profiles p
    WHERE p.id = old_id
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
      photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
      updated_at = now();

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = old_id) THEN
      UPDATE public.profiles new_p
      SET
        display_name = COALESCE(NULLIF(new_p.display_name, ''), old_p.display_name),
        photo_url = COALESCE(new_p.photo_url, old_p.photo_url),
        updated_at = now()
      FROM public.profiles old_p
      WHERE new_p.id = new_id AND old_p.id = old_id;

      DELETE FROM public.profiles WHERE id = old_id;
      RAISE NOTICE 'profiles: fundido para o ID novo';
    END IF;
  END IF;

  -- public + auth + storage: colunas de referência (uuid, text ou varchar)
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema IN ('public', 'auth', 'storage')
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id', 'owner'
      )
      AND c.udt_name IN ('uuid', 'text', 'character varying', 'varchar')
      AND to_regclass(format('%I.%I', c.table_schema, c.table_name)) IS NOT NULL
      AND NOT (c.table_schema = 'public' AND c.table_name IN ('user_roles', 'user_permissions', 'profiles'))
  LOOP
    IF r.udt_name = 'uuid' THEN
      sql := format(
        'UPDATE %I.%I SET %I = $1::uuid WHERE %I = $2::uuid',
        r.table_schema, r.table_name, r.column_name, r.column_name
      );
      EXECUTE sql USING new_id, old_id;
    ELSE
      sql := format(
        'UPDATE %I.%I SET %I = $1::text WHERE %I = $2::text',
        r.table_schema, r.table_name, r.column_name, r.column_name
      );
      EXECUTE sql USING new_id::text, old_id::text;
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '%.% (%): % linha(s)', r.table_schema, r.table_name || '.' || r.column_name, r.udt_name, n;
    END IF;
  END LOOP;

  -- remove conta antiga
  DELETE FROM auth.users WHERE id = old_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'auth.users: % conta(s) antiga(s) removida(s)', n;

  RAISE NOTICE 'Concluído.';
END $$;

COMMIT;

-- Verificação
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
    SELECT c.table_schema, c.table_name, c.column_name, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema IN ('public', 'auth', 'storage')
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id', 'owner', 'id'
      )
      AND c.udt_name IN ('uuid', 'text', 'character varying', 'varchar')
      AND to_regclass(format('%I.%I', c.table_schema, c.table_name)) IS NOT NULL
  LOOP
    IF r.udt_name = 'uuid' THEN
      sql := format(
        'SELECT count(*) FROM %I.%I WHERE %I = $1::uuid',
        r.table_schema, r.table_name, r.column_name
      );
      EXECUTE sql INTO cnt USING old_id;
    ELSE
      sql := format(
        'SELECT count(*) FROM %I.%I WHERE %I = $1::text',
        r.table_schema, r.table_name, r.column_name
      );
      EXECUTE sql INTO cnt USING old_id::text;
    END IF;
    IF cnt > 0 THEN
      RAISE NOTICE '%.%: % restante(s)', r.table_schema, r.table_name || '.' || r.column_name, cnt;
    END IF;
  END LOOP;
END $$;
