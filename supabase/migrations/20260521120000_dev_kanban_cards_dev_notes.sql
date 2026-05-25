-- Campo para o DEV registrar correções e detalhes técnicos do que foi realizado.
ALTER TABLE public.dev_kanban_cards
ADD COLUMN IF NOT EXISTS dev_notes TEXT;

COMMENT ON COLUMN public.dev_kanban_cards.dev_notes IS
  'Observações e correções técnicas registradas pelo desenvolvedor.';
