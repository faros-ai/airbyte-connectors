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
  asset?: VulnerableAssetSummary;
};

export type VulnerabilityRemediation = {
  id: string;
  vulnerabilityId: string;
  vulnerableAssetId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedDate: string; // ISO date string
  slaDeadlineDate: string; // ISO date string
  remediationDate: string; // ISO date string
  asset?: VulnerableAssetSummary;
};

export type VulnerableAsset = {
  id: string;
  name: string;
  assetType:
    | 'CODE_REPOSITORY'
    | 'CONTAINER_REPOSITORY'
    | 'CONTAINER_REPOSITORY_IMAGE'
    | 'MANIFEST_FILE'
    | 'SERVER'
    | 'SERVERLESS_FUNCTION'
    | 'WORKSTATION';
  hasBeenScanned: boolean;
  imageScanTag: string | null;
  scanners: Scanner[];
  assetTags: AssetTag[] | null;
  parentAccountOrOrganization: string | null;
  biosUuid: string;
  ipv4s: string[] | null;
  ipv6s: string[] | null;
  macAddresses: string[] | null;
  hostnames: string[] | null;
  fqdns: string[] | null;
  operatingSystems: string[] | null;
  targetId: string | null;
};

export type Scanner = {
  resourceId: string;
  integrationId: string;
  imageDigest: string | null;
  imagePushedAtDate: string | null;
  imageTags: string[] | null;
};

export type AssetTag = {
  key: string;
  value: string;
};

export type VulnerableAssetSummary = {
  name: string;
  imageTags: string[];
  type: string;
};
