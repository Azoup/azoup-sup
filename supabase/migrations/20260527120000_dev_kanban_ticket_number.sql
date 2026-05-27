-- Numeração sequencial de tickets no Kanban DEV.

CREATE SEQUENCE public.dev_kanban_ticket_number_seq;

ALTER TABLE public.dev_kanban_cards
  ADD COLUMN ticket_number integer;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS num
  FROM public.dev_kanban_cards
)
UPDATE public.dev_kanban_cards AS c
SET ticket_number = n.num
FROM numbered AS n
WHERE c.id = n.id;

ALTER TABLE public.dev_kanban_cards
  ALTER COLUMN ticket_number SET NOT NULL;

CREATE UNIQUE INDEX dev_kanban_cards_ticket_number_unique
  ON public.dev_kanban_cards (ticket_number);

SELECT setval(
  'public.dev_kanban_ticket_number_seq',
  COALESCE((SELECT MAX(ticket_number) FROM public.dev_kanban_cards), 0) + 1,
  false
);

ALTER TABLE public.dev_kanban_cards
  ALTER COLUMN ticket_number SET DEFAULT nextval('public.dev_kanban_ticket_number_seq');

COMMENT ON COLUMN public.dev_kanban_cards.ticket_number IS
  'Número sequencial do ticket no Kanban DEV (ex.: #0001).';
