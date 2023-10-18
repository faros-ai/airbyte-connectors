export interface SummaryKey {
  uid: string;
  source: string;
}

export interface DataQualityIssue {
  uid: string;
  description?: string;
  created_at?: string;
  recordIds?: string[];
  model?: string;
  summary?: SummaryKey;
}
