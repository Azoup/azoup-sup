-- Monitoramento de SLA Digisac: atendimentos abertos > 40 min (rastreio) e alerta admin > 45 min

CREATE TABLE public.digisac_sla_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  digisac_ticket_id TEXT NOT NULL,
  protocol TEXT NOT NULL,
  analyst_name TEXT,
  digisac_user_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'warn_40' CHECK (tier IN ('warn_40', 'escalate_45')),
  admin_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT digisac_sla_alerts_ticket_unique UNIQUE (digisac_ticket_id)
);

CREATE INDEX idx_digisac_sla_alerts_active
  ON public.digisac_sla_alerts (resolved_at, tier)
  WHERE resolved_at IS NULL;

CREATE TABLE public.digisac_sla_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID NOT NULL,
  alert_id UUID NOT NULL REFERENCES public.digisac_sla_alerts(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,
  analyst_name TEXT,
  duration_minutes INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT digisac_sla_notifications_recipient_alert_unique UNIQUE (recipient_id, alert_id)
);

CREATE INDEX idx_digisac_sla_notif_recipient_unread
  ON public.digisac_sla_notifications (recipient_id, read, created_at DESC);

ALTER TABLE public.digisac_sla_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digisac_sla_notifications ENABLE ROW LEVEL SECURITY;

-- Admins leem alertas ativos (histórico / painel)
CREATE POLICY "Admins view sla alerts"
  ON public.digisac_sla_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Usuário vê apenas suas notificações SLA
CREATE POLICY "Users view own sla notifications"
  ON public.digisac_sla_notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users update own sla notifications"
  ON public.digisac_sla_notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users delete own sla notifications"
  ON public.digisac_sla_notifications FOR DELETE
  TO authenticated
  USING (recipient_id = auth.uid());

-- Service role (cron) insere/atualiza via bypass RLS

ALTER PUBLICATION supabase_realtime ADD TABLE public.digisac_sla_notifications;
