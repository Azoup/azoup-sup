-- Checklist compartilhado: Kanban Confec usa card_type = 'confec'.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.kanban_card_checklist'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%card_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.kanban_card_checklist DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.kanban_card_checklist
  ADD CONSTRAINT kanban_card_checklist_card_type_check
  CHECK (card_type IN ('kanban', 'dev', 'confec'));
