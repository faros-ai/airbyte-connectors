import {FarosClient} from 'faros-js-client';

export interface RefreshedAtInterface {
  refreshedAt: Date;
  id: string;
}

export interface ZScoreComputationResult {
  status: number;
  std_dev?: number;
  avg?: number;
  z_score?: number;
  last_difference_in_hours?: number;
  last_updated_time?: Date;
  last_id?: string;
  msg?: string;
  nResults?: number;
}

export interface DataSummaryKey {
  uid: string;
  source: string;
}

export interface DataIssueInterface {
  uid: string;
  model?: string;
  description?: string;
  recordIds?: string[];
  title?: string;
  expectation?: string;
  createdAt?: Date;
  elapsedMs?: number;
  summary?: DataSummaryKey;
}

export interface FarosDataQualityRecordCount {
  model?: string;
  total?: number;
  phantoms?: number;
  nonPhantoms?: number;
}

export interface DataSummaryInterface {
  uid: string;
  source: string;
  counts: FarosDataQualityRecordCount[];
  createdAt?: Date;
  elapsedMs?: number;
}

export interface DataIssueWrapper {
  faros_DataQualityIssue: DataIssueInterface;
}

export interface DataSummaryWrapper {
  faros_DataQualitySummary: DataSummaryInterface;
}

export type GraphDoctorTestFunction = (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) => AsyncGenerator<DataIssueWrapper>;
