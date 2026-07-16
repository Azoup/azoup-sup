export interface DigisacSlaNotification {
  id: string;
  recipient_id: string;
  alert_id: string;
  protocol: string;
  analyst_name: string | null;
  client_name: string | null;
  client_contact: string | null;
  duration_minutes: number;
  started_at: string;
  message: string;
  read: boolean;
  created_at: string;
}

/** Registro canônico de alerta SLA (histórico). */
export interface DigisacSlaAlert {
  id: string;
  digisac_ticket_id: string;
  protocol: string;
  analyst_name: string | null;
  digisac_user_id: string | null;
  client_name: string | null;
  client_contact: string | null;
  started_at: string;
  duration_minutes: number;
  tier: string;
  admin_notified_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DigisacSlaMonitorPreview {
  protocol: string;
  analystName: string;
  durationMinutes: number;
}

export interface DigisacSlaMonitorSummary {
  ok: boolean;
  openTotal?: number;
  over40?: number;
  over45?: number;
  scanned: number;
  tracked: number;
  escalated: number;
  notified: number;
  resolved: number;
  errors: string[];
  preview?: DigisacSlaMonitorPreview[];
}
