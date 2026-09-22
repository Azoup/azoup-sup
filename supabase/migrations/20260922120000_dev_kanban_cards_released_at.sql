-- Data/hora em que o card do Kanban DEV entrou na coluna "Para atualizar".
ALTER TABLE public.dev_kanban_cards
ADD COLUMN IF NOT EXISTS released_at timestamptz;

COMMENT ON COLUMN public.dev_kanban_cards.released_at IS
  'Momento em que o card foi movido para a coluna Para atualizar.';
