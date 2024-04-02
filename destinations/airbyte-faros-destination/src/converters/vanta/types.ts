type OptString = string | null | undefined;

export interface BaseVulnerabilityType {
  uid: OptString;
  displayName: OptString;
  createdAt: OptString;
  externalURL: OptString;
  severity: OptString;
}

export type ExtendedVulnerabilityType = BaseVulnerabilityType & {
  description?: OptString;
  externalIds?: OptString[];
  [key: string]: any;
};

export interface GithubSecurityAdvisory {
  cveId: OptString;
  description: OptString;
  ghsaId: OptString;
}

export interface GithubVulnerabilityData {
  createdAt: OptString;
  displayName: OptString;
  externalURL: OptString;
  repositoryName: OptString;
  severity: OptString;
  slaDeadline: OptString;
  uid: OptString;
  vantaDescription: OptString;
  securityAdvisory: GithubSecurityAdvisory;
}

export interface AWSFindings {
  description: OptString;
  providerSeverity: OptString;
  name: OptString;
}

export interface AWSVulnerabilityData {
  createdAt: OptString;
  packageName: OptString;
  packageVersion: OptString;
  externalURL: OptString;
  scanType: OptString;
  severity: OptString;
  slaDeadline: OptString;
  uid: OptString;
  repositoryName: OptString;
  repositoryArn: OptString;
  displayName: OptString;
  findings: AWSFindings[];
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
  createdAt: OptString;
  externalURL: OptString;
  packageName: OptString;
  packageIdentifier: OptString;
  scanType: OptString;
  scannerScore: OptString;
  severity: OptString;
  uid: OptString;
  description: OptString;
  displayName: OptString;
  name: OptString;
  isFixable: OptString;
  remediation: OptString;
  remediateBy: OptString;
  asset: AWSV2Asset;
  ignored: AWSV2Ignored;
  imageTags: string[];
  imageDigest: OptString;
}

export const vulnTypeOptions: string[] = ['git', 'aws', 'awsv2'];

export interface vcsOrgKey {
  uid: string;
  source: string;
}

export interface vcsRepoKey {
  organization: vcsOrgKey;
  name: string;
}

export interface cicdOrgKey {
  uid: string;
  source: string;
}

export interface cicdRepoKey {
  organization: cicdOrgKey;
  uid: string;
}

export interface cicdArtifactKey {
  uid: string;
  repository: cicdRepoKey;
}
