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

export interface FarosDataQualityRecordCount {
  model?: string;
  total?: number;
  phantoms?: number;
  nonPhantoms?: number;
}

export interface DataQualitySummary {
  uid: string;
  source: string;
  createdAt?: Date;
  elapsedMs?: number;
  counts?: FarosDataQualityRecordCount[];
}
