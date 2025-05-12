import {AirbyteConfig} from 'faros-airbyte-cdk';
import {RoundRobinConfig} from 'faros-airbyte-common/common';

import {RunMode} from './streams/common';

export interface GitLabConfig extends AirbyteConfig, RoundRobinConfig {
  readonly api_url?: string;
  readonly token: string;
  readonly groups?: ReadonlyArray<string>;
  readonly excluded_groups?: ReadonlyArray<string>;
  readonly projects?: ReadonlyArray<string>;
  readonly excluded_projects?: ReadonlyArray<string>;
  readonly run_mode?: RunMode;
  readonly custom_streams?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly graphql_page_size?: number;
  readonly graphql_timeout?: number;
  readonly graphql_retries?: number;
  readonly concurrency_limit?: number;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly use_faros_graph_repos_selection?: boolean;
  readonly api_key?: string;
  readonly graph?: string;
  startDate?: Date;
  endDate?: Date;
  readonly requestedStreams?: Set<string>;
}

export interface Group {
  id: number;
  name: string;
  path: string;
  description?: string;
  visibility: string;
  web_url: string;
  created_at: string;
  updated_at?: string;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  description?: string;
  visibility: string;
  web_url: string;
  created_at: string;
  updated_at?: string;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
  };
  default_branch?: string;
}

export interface ProjectInclusion {
  project: Project;
  syncProjectData: boolean;
}

export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  closed_at?: string;
  target_branch: string;
  source_branch: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
  assignee?: {
    id: number;
    name: string;
    username: string;
  };
  web_url: string;
  merge_status: string;
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
  author: {
    id: number;
    name: string;
    username: string;
  };
  assignee?: {
    id: number;
    name: string;
    username: string;
  };
  web_url: string;
}

export interface Commit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  web_url: string;
}

export interface Tag {
  name: string;
  message?: string;
  target: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    created_at: string;
  };
  release?: {
    tag_name: string;
    description?: string;
  };
}

export interface Release {
  tag_name: string;
  name?: string;
  description?: string;
  created_at: string;
  released_at?: string;
}

export interface User {
  id: number;
  name: string;
  username: string;
  state: string;
  avatar_url?: string;
  web_url: string;
  created_at: string;
  email?: string;
}
