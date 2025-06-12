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

export interface Issue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  closed_by?: User;
  labels: string[];
  milestone?: any;
  assignees: User[];
  author: User;
  assignee?: User;
  user_notes_count: number;
  merge_requests_count: number;
  upvotes: number;
  downvotes: number;
  due_date?: string;
  confidential: boolean;
  discussion_locked?: boolean;
  web_url: string;
  time_stats?: {
    time_estimate: number;
    total_time_spent: number;
    human_time_estimate?: string;
    human_total_time_spent?: string;
  };
  task_completion_status?: {
    count: number;
    completed_count: number;
  };
  blocking_issues_count?: number;
  has_tasks?: boolean;
  references?: {
    short: string;
    relative: string;
    full: string;
  };
  moved_to_id?: number;
  service_desk_reply_to?: string;
  group_id: string;
  project_path: string;
}
