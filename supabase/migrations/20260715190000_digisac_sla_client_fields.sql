-- Dados do cliente nas notificações SLA Digisac
ALTER TABLE public.digisac_sla_alerts
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_contact TEXT;

ALTER TABLE public.digisac_sla_notifications
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_contact TEXT;
