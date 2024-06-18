export interface CopilotSeat {
  org: string;
  user: string;
  created_at: string;
  updated_at?: string | null;
  pending_cancellation_date?: string | null;
  last_activity_at?: string | null;
}
