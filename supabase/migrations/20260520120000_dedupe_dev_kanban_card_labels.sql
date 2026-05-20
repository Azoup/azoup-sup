-- Remove vínculos duplicados e impede novas duplicatas no Kanban DEV.
DELETE FROM public.dev_kanban_card_labels a
USING public.dev_kanban_card_labels b
WHERE a.id > b.id
  AND a.card_id = b.card_id
  AND a.label_id = b.label_id;

CREATE UNIQUE INDEX IF NOT EXISTS dev_kanban_card_labels_card_label_unique
  ON public.dev_kanban_card_labels (card_id, label_id);

NOTIFY pgrst, 'reload schema';
