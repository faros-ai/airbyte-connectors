type OptString = string | null | undefined;
type OptBool = boolean | null | undefined;

export interface BaseVulnerabilityType {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptString;
}

export type ExtendedVulnerabilityType = BaseVulnerabilityType & {
  description?: OptString;
  externalIds?: OptString[];
  vulnURL?: OptString;
  [key: string]: any;
};

export interface GitV2Ignored {
  ignoredAt: OptString;
  ignoredUntil: OptString;
  ignoreReason: OptString;
  reactivateWhenFixable: OptBool;
}

export interface GitV2Asset {
  displayName: OptString;
  assetType: OptString;
  imageScanTag: OptString;
}

export interface GitV2VulnerabilityData {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptString;
  relatedUrls: string[];
  packageName: OptString;
  orgName: OptString;
  name: OptString;
  isFixable: OptBool;
  duplicateVulnerabilityId: OptString;
  description: OptString;
  relatedCves: string[];
  remediateBy: OptString;
  packageIdentifier: OptString;
  // This is normally the "CVE-xxxx-xxxx" string
  externalVulnerabilityId: OptString;
  ignored: GitV2Ignored;
  asset: GitV2Asset;
}

export interface AWSV2Ignored {
  ignoreReason: OptString;
  ignoredUntil: OptString;
  ignoredAt: OptString;
}

export interface AWSV2Asset {
  displayName: OptString;
}

export interface AWSV2VulnerabilityData {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptString;
  externalVulnerabilityId: OptString;
  packageName: OptString;
  packageIdentifier: OptString;
  description: OptString;
  name: OptString;
  isFixable: OptBool;
  remediateBy: OptString;
  asset: AWSV2Asset;
  ignored: AWSV2Ignored;
  imageTags: string[];
  imageDigest: OptString;
  relatedUrls: string[];
}

export const vulnTypeOptions: string[] = ['gitv2', 'awsv2'];

export interface VcsOrgKey {
  uid: string;
  source: string;
}

export interface VcsRepoKey {
  organization: VcsOrgKey;
  name: string;
}

export interface CicdOrgKey {
  uid: string;
  source: string;
}

export interface CicdRepoKey {
  organization: CicdOrgKey;
  uid: string;
}

export interface CicdArtifactKey {
  uid: string;
  repository: CicdRepoKey;
}

export type VulnerabilityKey = {
  uid: string;
  source: string;
};

export type VcsRepositoryVulnerabilityResponse = {
  id: string;
  resolvedAt: OptString;
  vulnerability: VulnerabilityKey;
  repository: VcsRepoKey;
};

export type CicdArtifactVulnerabilityResponse = {
  id: string;
  resolvedAt: OptString;
  vulnerability: VulnerabilityKey;
  artifact: CicdArtifactKey;
};

// All the keys have a single abstract type that can represent them:
export type FarosObjectKey =
  | VcsOrgKey
  | VcsRepoKey
  | CicdOrgKey
  | CicdRepoKey
  | CicdArtifactKey
  | VulnerabilityKey;
