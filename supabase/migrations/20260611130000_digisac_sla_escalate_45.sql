-- Ajusta limiar de notificação: 45 min (antes 60 min)
UPDATE public.digisac_sla_alerts SET tier = 'escalate_45' WHERE tier = 'escalate_60';

ALTER TABLE public.digisac_sla_alerts DROP CONSTRAINT IF EXISTS digisac_sla_alerts_tier_check;
ALTER TABLE public.digisac_sla_alerts
  ADD CONSTRAINT digisac_sla_alerts_tier_check
  CHECK (tier IN ('warn_40', 'escalate_45'));
