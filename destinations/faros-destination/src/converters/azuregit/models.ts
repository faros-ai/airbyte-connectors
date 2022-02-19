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

interface TagCommitObject {
  objectId: string;
  objectType: string;
}

export interface TagCommit {
  name: string;
  objectId: string;
  taggedObject: TagCommitObject;
  taggedBy: CommitAuthor;
  message: string;
  url: string;
}

export interface Tag {
  name: string;
  objectId: string;
  url: string;
  creator: Creator;
  commit: TagCommit;
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
  tags: Tag[];
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

export interface PullRequestCommit {
  commitId: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  comment: string;
  url: string;
}

export interface PullRequestReviewer {
  reviewerUrl: string;
  vote: number;
  hasDeclined: boolean;
  isFlagged: boolean;
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
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
  reviewers: [PullRequestReviewer];
  url: string;
  supportsIterations: boolean;
  repository: PullRequestRepository;
  commits: PullRequestCommit[];
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

export interface OrgType {
  category: OrgTypeCategory;
  detail: string;
}

export enum OrgTypeCategory {
  Organization = 'Organization',
  Workspace = 'Workspace',
  Group = 'Group',
  Custom = 'Custom',
}
