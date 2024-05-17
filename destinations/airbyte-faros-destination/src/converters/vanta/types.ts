type OptString = string | null | undefined;
type OptBool = boolean | null | undefined;
type OptNumber = number | null | undefined;

export interface BaseVulnerabilityType {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptString | OptNumber;
}

export type ExtendedVulnerabilityType = BaseVulnerabilityType & {
  description?: OptString;
  externalIds?: OptString[];
  vulnURL?: OptString;
  [key: string]: any;
};

export interface GithubSecurityAdvisory {
  cveId: OptString;
  description: OptString;
  ghsaId: OptString;
}

export interface GithubVulnerabilityData {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptNumber;
  repositoryName: OptString;
  slaDeadline: OptString;
  vantaDescription: OptString;
  securityAdvisory: GithubSecurityAdvisory;
}

export interface AWSFindings {
  description: OptString;
  providerSeverity: OptString;
  name: OptString;
  uri: OptString;
}

export interface AWSVulnerabilityData {
  uid: string;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptNumber;
  packageName: OptString;
  packageVersion: OptString;
  slaDeadline: OptString;
  repositoryName: OptString;
  repositoryArn: OptString;
  findings: AWSFindings[];
  imageTags: string[];
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

export type BaseAWSVuln = AWSVulnerabilityData | AWSV2VulnerabilityData;

export const vulnTypeOptions: string[] = ['git', 'aws', 'awsv2'];

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

export type VulnerabilityInfo = {
  id: string;
  resolvedAt: OptString;
  vulnerabilityUid: OptString;
};

// All the keys have a single abstract type that can represent them:
export type FarosObjectKey =
  | VcsOrgKey
  | VcsRepoKey
  | CicdOrgKey
  | CicdRepoKey
  | CicdArtifactKey;
