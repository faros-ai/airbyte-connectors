interface Href {
  href: string;
}
export interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
  state: string;
  revision: number;
  visibility: string;
  lastUpdateTime: string;
}

export interface Creator {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
  descriptor: string;
}

export interface Ref {
  id: string;
  name: string;
  objectId: string;
  url: Project;
  creator: Creator;
}

export interface RefResponse {
  count: number;
  value: Ref[];
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  project: Project;
  defaultBranch: string;
  size: number;
  remoteUrl: string;
  sshUrl: string;
  webUrl: string;
  isDisabled: boolean;
  refs: Ref[];
}

export interface RepositoryResponse {
  count: number;
  value: Repository[];
}

interface MergeSourceCommit {
  commitId: string;
  url: string;
}

export interface PullRequestRepository {
  id: string;
  name: string;
  url: string;
  project: Project;
}

export interface PullRequest {
  pullRequestId: number;
  codeReviewId: number;
  status: string;
  createdBy: Creator;
  creationDate: string;
  title: string;
  description: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus: string;
  isDraft: boolean;
  mergeId: string;
  lastMergeSourceCommit: MergeSourceCommit;
  lastMergeCommit: MergeSourceCommit;
  reviewers: [any];
  url: string;
  supportsIterations: boolean;
  repository: PullRequestRepository;
}

export interface PullRequestResponse {
  count: number;
  value: PullRequest[];
}
