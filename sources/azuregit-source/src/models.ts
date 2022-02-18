interface Href {
  href: string;
}
interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
  state: string;
  revision: number;
  visibility: string;
  lastUpdateTime: string;
}

interface Creator {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
  descriptor: string;
}

export interface Branch {
  name: string;
  aheadCount: number;
  behindCount: number;
  isBaseVersion: boolean;
  commits: Commit[];
}

export interface BranchResponse {
  count: number;
  value: Branch[];
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
  branches: Branch[];
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

interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

interface CommitChange {
  Add: number;
  Edit: number;
  Delete: number;
}

export interface Commit {
  commitId: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  comment: string;
  changeCounts: CommitChange;
  url: string;
  remoteUrl: string;
}

export interface CommitResponse {
  count: number;
  value: Commit[];
}
