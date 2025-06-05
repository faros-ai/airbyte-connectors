export type GitLabToken = {
  type: 'token';
  personal_access_token: string;
};

export interface User {
  id: number;
  username: string;
  name?: string;
  email?: string;
  state: string;
  web_url: string;
  created_at?: string;
  updated_at?: string;
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
}
