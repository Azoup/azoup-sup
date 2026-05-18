-- =============================================================================
-- Substituir utilizador em todo o projeto ittmglvkympbyeowgucl
-- DE: ef06b578-6d1c-477c-9d14-5f969d1800e2
-- PARA: d32a6840-3715-4c40-93e5-269317f3609d
--
-- Execute no SQL Editor:
-- https://supabase.com/dashboard/project/ittmglvkympbyeowgucl/sql/new
--
-- IMPORTANTE: Faça backup ou confirme os IDs antes de executar.
-- O script assume que o ID NOVO já existe em auth.users (conta destino).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  old_id uuid := 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  new_id uuid := 'd32a6840-3715-4c40-93e5-269317f3609d';
  old_exists boolean;
  new_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = old_id) INTO old_exists;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = new_id) INTO new_exists;

  IF NOT new_exists THEN
    RAISE EXCEPTION 'O ID novo (%) não existe em auth.users. Crie a conta destino primeiro.', new_id;
  END IF;

  RAISE NOTICE 'ID antigo em auth.users: %', old_exists;
  RAISE NOTICE 'ID novo em auth.users: %', new_exists;
END $$;

-- ---------------------------------------------------------------------------
-- public: referências ao utilizador
-- ---------------------------------------------------------------------------

UPDATE public.activity_logs
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

-- Evita duplicar (user_id, role) se o novo já tiver a mesma role
DELETE FROM public.user_roles ur_old
WHERE ur_old.user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur_new
    WHERE ur_new.user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
      AND ur_new.role = ur_old.role
  );

UPDATE public.user_roles
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

DELETE FROM public.user_permissions up_old
WHERE up_old.user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2'
  AND EXISTS (
    SELECT 1 FROM public.user_permissions up_new
    WHERE up_new.user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
      AND up_new.permission_key = up_old.permission_key
  );

UPDATE public.user_permissions
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.kanban_cards
SET created_by = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE created_by = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.kanban_card_comments
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.kanban_card_files
SET uploaded_by = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE uploaded_by = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.dev_kanban_cards
SET created_by = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE created_by = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.dev_kanban_card_comments
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.dev_kanban_card_files
SET uploaded_by = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE uploaded_by = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.dev_kanban_notifications
SET actor_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE actor_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE public.dev_kanban_notifications
SET recipient_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE recipient_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

-- profiles: PK = auth.users.id — funde ou remove o perfil antigo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = 'd32a6840-3715-4c40-93e5-269317f3609d') THEN
    DELETE FROM public.profiles WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  ELSE
    UPDATE public.profiles
    SET id = 'd32a6840-3715-4c40-93e5-269317f3609d'
    WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- storage: ficheiros do utilizador (bucket kanban-files, etc.)
-- ---------------------------------------------------------------------------

UPDATE storage.objects
SET owner = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE owner = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE storage.objects
SET owner_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE owner_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

-- ---------------------------------------------------------------------------
-- auth: sessões e identidades do ID antigo
-- ---------------------------------------------------------------------------

UPDATE auth.identities
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE auth.sessions
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE auth.refresh_tokens
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE auth.mfa_factors
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

UPDATE auth.one_time_tokens
SET user_id = 'd32a6840-3715-4c40-93e5-269317f3609d'
WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

-- Remove conta antiga em auth (cascade limpa o que restar ligado ao old id)
DELETE FROM auth.users
WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';

-- ---------------------------------------------------------------------------
-- Qualquer coluna uuid restante em public (descoberta automática)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  sql text;
  old_id text := 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
  new_id text := 'd32a6840-3715-4c40-93e5-269317f3609d';
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.udt_name = 'uuid'
      AND c.column_name IN (
        'user_id', 'created_by', 'uploaded_by', 'actor_id', 'recipient_id', 'owner_id'
      )
  LOOP
    sql := format(
      'UPDATE %I.%I SET %I = %L::uuid WHERE %I = %L::uuid',
      r.table_schema, r.table_name, r.column_name, new_id, r.column_name, old_id
    );
    EXECUTE sql;
  END LOOP;
END $$;

COMMIT;

-- Verificação: não deve devolver linhas
SELECT 'activity_logs' AS tabela, count(*) AS restantes
FROM public.activity_logs WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2'
UNION ALL
SELECT 'user_roles', count(*) FROM public.user_roles WHERE user_id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2'
UNION ALL
SELECT 'profiles', count(*) FROM public.profiles WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2'
UNION ALL
SELECT 'auth.users', count(*) FROM auth.users WHERE id = 'ef06b578-6d1c-477c-9d14-5f969d1800e2';
