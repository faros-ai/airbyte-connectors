export type UserData = {
  id?: string;
  email?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  last_active?: string;
  usage_stats?: {
    total_sessions?: number;
    total_commands?: number;
    total_chat_messages?: number;
  };
};

export type ChatData = {
  id?: string;
  user_id?: string;
  session_id?: string;
  message?: string;
  timestamp?: string;
  type?: string;
  metadata?: Record<string, any>;
};

export type CommandData = {
  id?: string;
  user_id?: string;
  session_id?: string;
  command?: string;
  timestamp?: string;
  execution_time?: number;
  success?: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
};

export type PCWData = {
  id?: string;
  user_id?: string;
  session_id?: string;
  timestamp?: string;
  event_type?: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
};

export type StreamSlice = {
  start_date: string;
  end_date: string;
};
