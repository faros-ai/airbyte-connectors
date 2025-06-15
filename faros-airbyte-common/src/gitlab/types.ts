export type GitLabToken = {
  type: 'token';
  personal_access_token: string;
};

export interface User {
  id: number;
  username: string;
  name?: string;
  public_email?: string;
  publicEmail?: string; // from graphql
  email?: string;
  state: string;
  web_url: string;
  created_at?: string;
  updated_at?: string;
  group_id?: string;
}

export interface Group {
  id: string;
  parent_id: string | null;
  name: string;
  path: string;
  web_url: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  namespace: {
    id: string;
    name: string;
    path: string;
    kind: string;
    full_path: string;
  };
  default_branch: string;
  archived: boolean;
  group_id: string;
  empty_repo: boolean;
  syncRepoData?: boolean;
}

export interface Commit {
  id: string;
  short_id: string;
  created_at: string;
  parent_ids: string[];
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  web_url: string;
  group_id: string;
  project_path: string;
  branch: string;
  // Author username resolved via UserCollector
  author_username?: string;
}

export interface Tag {
  name: string;
  title: string;
  commit_id: string;
}

export interface MergeRequestAuthor {
  name: string;
  publicEmail?: string;
  username: string;
  webUrl: string;
}

export interface MergeRequestAssignee {
  name: string;
  publicEmail?: string;
  username: string;
  webUrl: string;
}

export interface MergeRequestDiffStats {
  additions: number;
  deletions: number;
  fileCount: number;
}

export interface MergeRequestLabel {
  title: string;
}

export interface MergeRequestNote {
  id: string;
  author: MergeRequestAuthor;
  body: string;
  system: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MergeRequest {
  id: string;
  iid: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  author: MergeRequestAuthor;
  assignees: {
    nodes: MergeRequestAssignee[];
  };
  mergeCommitSha: string | null;
  commitCount: number;
  userNotesCount: number;
  diffStatsSummary: MergeRequestDiffStats;
  state: string;
  title: string;
  webUrl: string;
  notes: MergeRequestNote[];
  labels: {
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
    nodes: MergeRequestLabel[];
  };
  project_path: string;
  group_id?: string;
}

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
