export interface DigisacSlaNotification {
  id: string;
  recipient_id: string;
  alert_id: string;
  protocol: string;
  analyst_name: string | null;
  duration_minutes: number;
  started_at: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface DigisacSlaMonitorSummary {
  ok: boolean;
  scanned: number;
  tracked: number;
  escalated: number;
  notified: number;
  resolved: number;
  errors: string[];
}
