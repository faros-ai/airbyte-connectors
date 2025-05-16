export interface GitLabConfig {
  authentication?: {
    type: string;
    token: string;
  };
  token?: string; // For backward compatibility
  url?: string;
  api_version?: string;
  reject_unauthorized?: boolean;
  groups?: ReadonlyArray<string>;
  excluded_groups?: ReadonlyArray<string>;
  cutoff_days?: number;
  page_size?: number;
  api_url?: string;
  api_key?: string;
  graph?: string;
  bucket_id?: number;
  bucket_total?: number;
  concurrency_limit?: number;
  
  startDate?: Date;
  endDate?: Date;
  start_date?: string;
  end_date?: string;
}

export interface Group {
  id: number;
  name: string;
  path: string;
  description: string | null;
  visibility: string;
  web_url: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  parent_id: number | null;
}
