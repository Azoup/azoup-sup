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
