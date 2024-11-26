export interface CicdOrgKey {
  uid: string;
  source: string;
}

export interface CicdRepoKey {
  organization: CicdOrgKey;
  uid: string;
}

export interface ArtifactKey {
  uid: string;
  repository: CicdRepoKey;
}
