import {
  Camelize,
  CommitSchema,
  DeploymentSchema,
  EventSchema,
  GroupSchema,
  IssueSchema,
  MergeRequestSchema,
  NoteSchema,
  ProjectSchema,
  ReleaseSchema,
  TagSchema,
  UserSchema,
} from '@gitbeaker/rest';

export type FarosProjectOutput = {
  readonly __brand: 'FarosProject';
  id: string;
  group_id: string;
  syncRepoData?: boolean;
} & Pick<
  ProjectSchema,
  | 'archived'
  | 'created_at'
  | 'default_branch'
  | 'description'
  | 'empty_repo'
  | 'name'
  | 'namespace'
  | 'owner'
  | 'path'
  | 'path_with_namespace'
  | 'updated_at'
  | 'visibility'
  | 'web_url'
>;

export type FarosUserOutput = {
  readonly __brand: 'FarosUser';
  group_id?: string;
} & Pick<UserSchema, 'username'> &
  Partial<Pick<UserSchema, 'email' | 'name' | 'state' | 'web_url'>>;

export type FarosGroupOutput = {
  readonly __brand: 'FarosGroup';
  id: string;
  parent_id: string | null;
} & Pick<
  GroupSchema,
  | 'created_at'
  | 'description'
  | 'name'
  | 'path'
  | 'updated_at'
  | 'visibility'
  | 'web_url'
>;

export type FarosCommitOutput = {
  readonly __brand: 'FarosCommit';
  author_username: string | null;
  branch: string;
  group_id: string;
  project_path: string;
} & Pick<CommitSchema, 'id' | 'message' | 'created_at' | 'web_url'>;

export type FarosTagOutput = {
  readonly __brand: 'FarosTag';
  commit_id?: string;
  group_id: string;
  project_path: string;
} & Pick<TagSchema, 'name' | 'message' | 'target' | 'title'>;

export type FarosMergeRequestOutput = {
  readonly __brand: 'FarosMergeRequest';
  author_username: string;
  group_id: string;
  project_path: string;
  labels: string[];
  notes: ({author_username: string} & Pick<
    NoteSchema,
    'id' | 'body' | 'created_at' | 'updated_at'
  >)[];
} & Pick<
  Camelize<MergeRequestSchema>,
  | 'iid'
  | 'title'
  | 'description'
  | 'state'
  | 'webUrl'
  | 'createdAt'
  | 'updatedAt'
  | 'mergedAt'
  | 'commitCount'
  | 'userNotesCount'
  | 'diffStatsSummary'
  | 'mergeCommitSha'
>;

export type FarosMergeRequestReviewOutput = {
  readonly __brand: 'FarosMergeRequestReview';
  group_id: string;
  project_path: string;
} & Pick<
  EventSchema,
  | 'action_name'
  | 'author_username'
  | 'created_at'
  | 'id'
  | 'target_iid'
  | 'target_type'
>;

export type FarosIssueOutput = {
  readonly __brand: 'FarosIssue';
  group_id: string;
  project_path: string;
  author_username: string;
  assignee_usernames: string[];
} & Pick<
  IssueSchema,
  | 'id'
  | 'title'
  | 'description'
  | 'state'
  | 'created_at'
  | 'updated_at'
  | 'labels'
>;

export type FarosReleaseOutput = {
  readonly __brand: 'FarosRelease';
  author_username: string | null;
  group_id: string;
  project_path: string;
} & Pick<
  ReleaseSchema,
  | 'tag_name'
  | 'name'
  | 'description'
  | 'created_at'
  | 'released_at'
  | '_links'
>;

export type FarosDeploymentOutput = {
  readonly __brand: 'FarosDeployment';
  group_id: string;
  path_with_namespace: string;
} & Pick<
  DeploymentSchema,
  | 'id'
  | 'iid'
  | 'ref'
  | 'sha'
  | 'user'
  | 'created_at'
  | 'updated_at'
  | 'status'
  | 'deployable'
  | 'environment'
>;
