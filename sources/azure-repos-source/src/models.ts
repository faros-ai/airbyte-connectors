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

export interface ProjectResponse {
  count: number;
  value: Project[];
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
}

export interface BranchResponse {
  count: number;
  value: Branch[];
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
  peeledObjectId?: string;
  url: string;
  creator: Creator;
  commit?: TagCommit;
}

export interface TagResponse {
  count: number;
  value: Tag[];
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

export interface PullRequestThreadComment {
  id: number;
  parentCommentId: number;
  content: string;
  publishedDate: string;
  lastUpdatedDate: string;
  lastContentUpdatedDate: string;
  commentType: string;
  author: Creator;
}

export interface PullRequestThread {
  pullRequestThreadContext?: string;
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  status: string;
  threadContext?: string;
  comments: PullRequestThreadComment[];
}

export interface PullRequestThreadResponse {
  count: number;
  value: PullRequestThread[];
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

export interface PullRequestCommitChangeCounts {
  Edit?: number;
  Add?: number;
  Delete?: number;
}

export interface CommitChangeCountsResponse {
  changeCounts: PullRequestCommitChangeCounts;
}

export interface PullRequestCommit {
  commitId: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  comment: string;
  url: string;
  changeCounts: PullRequestCommitChangeCounts;
}

export interface PullRequestCommitResponse {
  count: number;
  value: PullRequestCommit[];
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
  closedDate?: string;
  title: string;
  description: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus: string;
  isDraft: boolean;
  mergeId: string;
  lastMergeSourceCommit: MergeSourceCommit;
  lastMergeCommit: MergeSourceCommit;
  reviewers: PullRequestReviewer[];
  url: string;
  supportsIterations: boolean;
  repository: PullRequestRepository;
  threads?: PullRequestThread[];
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

export interface CommitRepository {
  id: string;
  name: string;
  url: string;
  project: Project;
}

export interface Commit {
  commitId: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  comment: string;
  changeCounts: CommitChange;
  url: string;
  remoteUrl: string;
  repository?: CommitRepository;
  branch?: string;
}

export interface CommitResponse {
  count: number;
  value: Commit[];
}

interface Href {
  href: string;
}

interface UserLink {
  self: Href;
  memberships: Href;
  membershipState: Href;
  storageKey: Href;
  avatar: Href;
}

export interface User {
  id: string;
  subjectKind: string;
  domain: string;
  principalName: string;
  mailAddress: string;
  origin: string;
  originId: string;
  displayName: string;
  url: string;
  descriptor: string;
  _links: UserLink;
  uniqueName: string;
}

export interface UserResponse {
  count: number;
  value: User[];
}
