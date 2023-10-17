export interface DataQualityIssue {
  summary: string;
  description: string;
  created_at: string;
  updated_at: string;
  discarded_at?: any;
  tasks: [any];
}
