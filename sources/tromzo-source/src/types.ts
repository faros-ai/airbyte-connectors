export interface TromzoConfig {
  api_key: string;
  organization: string;
  api_timeout?: number;
  api_page_size?: number;
  api_max_retries?: number;
}

export interface Finding {
  // Is this needed?
  id: string;
  repository?: {
    id?: string;
    uid?: string;
  };
  toolName?: string;
  dbCreatedAt?: string;
  dbUpdatedAt?: string;
  scannerCreatedAt?: string;
  scannerUpdatedAt?: string;
  businessRisk?: string;
  dismissReason?: string;
  dismissedAt?: string;
  scannerDismissedAt?: string;
  userDueDate?: string;
  sourceFilename?: string;
  sourcePath?: string;
  vulnerableVersion?: string;
  vulnerability?: {
    severity?: string;
    cve?: string;
    ghsa?: string;
    fixAvailable?: boolean;
  };
  status?: string;
  scannerStatus?: string;
  userUpdatedStatus?: string;
  line?: number;
  jiraUrl?: string;
  lastReviewed?: string;
  scannerConfidence?: string;
  asset?: {
    name?: string;
    id?: string;
    uid?: string;
    type?: string;
    description?: string;
  };
  projects?: any; // Type needs to be specified based on actual data structure
  key?: string;
}
