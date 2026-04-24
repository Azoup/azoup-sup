-- Notifications table for DEV Kanban ticket updates
CREATE TABLE public.dev_kanban_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID NOT NULL,
  card_id UUID NOT NULL,
  card_title TEXT NOT NULL,
  action_type TEXT NOT NULL,
  actor_id UUID,
  actor_name TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dev_notif_recipient_unread ON public.dev_kanban_notifications(recipient_id, read, created_at DESC);
CREATE INDEX idx_dev_notif_card ON public.dev_kanban_notifications(card_id);

ALTER TABLE public.dev_kanban_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.dev_kanban_notifications FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

CREATE POLICY "Auth can insert notifications"
ON public.dev_kanban_notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users update own notifications"
ON public.dev_kanban_notifications FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid());

CREATE POLICY "Users delete own notifications"
ON public.dev_kanban_notifications FOR DELETE
TO authenticated
USING (recipient_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dev_kanban_notifications;