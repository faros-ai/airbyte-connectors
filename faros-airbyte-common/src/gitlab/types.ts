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
