-- =============================================================================
-- Restaurar ADMIN + migrar dados restantes para o ID novo
-- DE: ef06b578-6d1c-477c-9d14-5f969d1800e2
-- PARA: d32a6840-3715-4c40-93e5-269317f3609d
-- https://supabase.com/dashboard/project/ittmglvkympbyeowgucl/sql/new
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
    RAISE EXCEPTION 'Conta % não existe em auth.users. Faça login com o ID novo primeiro.', new_id;
  END IF;

  RAISE NOTICE '=== 1) Garantir role ADMIN no ID novo ===';

  -- Remove role "user" se existir admin (opcional: mantém só admin como principal)
  DELETE FROM public.user_roles
  WHERE user_id = new_id AND role = 'user'::public.app_role
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = new_id AND role = 'admin'::public.app_role
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'admin role inserida/confirmada';

  RAISE NOTICE '=== 2) Fundir perfil (nome/foto do antigo → novo) ===';

  IF to_regclass('public.profiles') IS NOT NULL THEN
    INSERT INTO public.profiles (id, display_name, photo_url)
    SELECT new_id, p.display_name, p.photo_url
    FROM public.profiles p
    WHERE p.id = old_id
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(
        NULLIF(EXCLUDED.display_name, ''),
        public.profiles.display_name
      ),
      photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
      updated_at = now();

  -- Se ainda existir perfil antigo, copiar campos e apagar
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = old_id) THEN
      UPDATE public.profiles new_p
      SET
        display_name = COALESCE(NULLIF(new_p.display_name, ''), old_p.display_name),
        photo_url = COALESCE(new_p.photo_url, old_p.photo_url),
        updated_at = now()
      FROM public.profiles old_p
      WHERE new_p.id = new_id AND old_p.id = old_id;

      DELETE FROM public.profiles WHERE id = old_id;
    END IF;
  END IF;

  RAISE NOTICE '=== 3) Copiar permissões do ID antigo (se ainda existirem) ===';

  IF to_regclass('public.user_permissions') IS NOT NULL THEN
    INSERT INTO public.user_permissions (user_id, permission_key, allowed)
    SELECT new_id, up.permission_key, up.allowed
    FROM public.user_permissions up
    WHERE up.user_id = old_id
    ON CONFLICT (user_id, permission_key)
    DO UPDATE SET allowed = (public.user_permissions.allowed OR EXCLUDED.allowed);
  END IF;

  RAISE NOTICE '=== 4) Migrar referências que ainda apontam para o ID antigo ===';

  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema IN ('public', 'auth', 'storage')
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id', 'owner'
      )
      AND c.udt_name IN ('uuid', 'text', 'character varying', 'varchar')
      AND to_regclass(format('%I.%I', c.table_schema, c.table_name)) IS NOT NULL
      AND NOT (c.table_schema = 'public' AND c.table_name IN ('profiles'))
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
      RAISE NOTICE '%.%: % linha(s) migrada(s)', r.table_schema, r.table_name || '.' || r.column_name, n;
    END IF;
  END LOOP;

  RAISE NOTICE '=== 5) Remover conta antiga em auth (se existir) ===';
  DELETE FROM auth.users WHERE id = old_id;

  RAISE NOTICE 'Concluído. Faça logout e login de novo no app.';
END $$;

COMMIT;

-- Diagnóstico do ID novo (deve mostrar admin + contagens de dados)
SELECT 'user_roles' AS item, role::text AS valor, NULL::bigint AS qtd
FROM public.user_roles
WHERE user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
UNION ALL
SELECT 'profile', display_name, NULL FROM public.profiles WHERE id = 'd32a6840-3715-4c40-93e5-269317f3609d'
UNION ALL
SELECT 'user_permissions', permission_key, CASE WHEN allowed THEN 1 ELSE 0 END
FROM public.user_permissions WHERE user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
UNION ALL
SELECT 'kanban_cards (created_by)', NULL, count(*)::bigint FROM public.kanban_cards
WHERE created_by = 'd32a6840-3715-4c40-93e5-269317f3609d'
UNION ALL
SELECT 'activity_logs', NULL, count(*)::bigint FROM public.activity_logs
WHERE user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
UNION ALL
SELECT 'ainda no ID antigo (auth.users)', email, NULL FROM auth.users
WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
