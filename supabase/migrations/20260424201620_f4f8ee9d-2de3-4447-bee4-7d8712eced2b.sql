ALTER TABLE public.dev_kanban_notifications
ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'dev';

CREATE INDEX IF NOT EXISTS idx_dev_kanban_notifications_recipient_read
  ON public.dev_kanban_notifications (recipient_id, read, created_at DESC);