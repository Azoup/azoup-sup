-- Habilita Realtime para tabelas usadas no app (sincronização entre usuários logados).

ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_labels;

ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_card_images;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_card_labels;

ALTER PUBLICATION supabase_realtime ADD TABLE public.doubt_records;

-- Tabelas opcionais (criadas em migrações posteriores; ignorar se ainda não existirem)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'kanban_card_files') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_files;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dev_kanban_card_files') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_card_files;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'kanban_card_checklist') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_checklist;
  END IF;
END $$;
