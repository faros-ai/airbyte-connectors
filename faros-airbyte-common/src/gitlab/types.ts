import {
  Camelize,
  CommitSchema,
  GroupSchema,
  MergeRequestSchema,
  NoteSchema,
  ProjectSchema,
  TagSchema,
  UserSchema,
} from '@gitbeaker/rest';

export interface GitLabToken {
  type: 'token';
  personal_access_token: string;
}

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

export interface MergeRequestEvent {
  id: string;
  action_name: string;
  target_iid: number;
  target_type: string;
  author: {
    name: string;
    public_email?: string;
    username: string;
    web_url: string;
  };
  created_at: string;
  project_path: string;
  group_id?: string;
}

export interface Issue {
  id: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  assignees: {username: string}[];
  author: {username: string};
  group_id: string;
  project_path: string;
}
