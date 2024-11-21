export type Vulnerability = {
  id: string;
  name: string;
  description: string;
  integrationId: string;
  packageIdentifier: string | null;
  vulnerabilityType: 'CONFIGURATION' | 'COMMON' | 'GROUPED';
  targetId: string;
  firstDetectedDate: string; // ISO date string
  sourceDetectedDate: string | null; // ISO date string or null
  lastDetectedDate: string | null; // ISO date string or null
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  cvssSeverityScore: number | null;
  scannerScore: number | null;
  isFixable: boolean;
  remediateByDate: string | null; // ISO date string or null
  relatedVulns: string[];
  relatedUrls: string[];
  externalURL: string;
  scanSource?: string;
  deactivateMetadata: {
    isVulnDeactivatedIndefinitely: boolean;
    deactivatedUntilDate: string | null; // ISO date string or null
    deactivationReason: string;
    deactivatedOnDate: string; // ISO date string
    deactivatedBy: string;
  } | null;
  repoName: string;
  imageTags: string[];
};

export type VulnerabilityRemediation = {
  id: string;
  vulnerabilityId: string;
  vulnerableAssetId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedDate: string; // ISO date string
  slaDeadlineDate: string; // ISO date string
  remediationDate: string; // ISO date string
};
