export interface Project {
  slug: string;
  organization_name: string;
  organization_id: string;
  name: string;
  id: string;
  organization_slug: string;
  vcs_info: VcsInfo;
}

export interface VcsInfo {
  vcs_url: string;
  provider: string;
  default_branch: string;
}

export interface Actor {
  login: string;
  avatar_url: string;
}

export interface Trigger {
  received_at: Date;
  type: string;
  actor: Actor;
}

export interface Vcs {
  origin_repository_url: string;
  target_repository_url: string;
  revision: string;
  provider_name: string;
  branch: string;
}

export interface Pipeline {
  id: string;
  errors: any[];
  project_slug: string;
  updated_at: string;
  number: number;
  state: string;
  created_at: string;
  trigger: Trigger;
  vcs: Vcs;
  workflows: Workflow[];
  computedProperties: {
    updatedAt: string;
  };
}

export interface Workflow {
  pipeline_id: string;
  id: string;
  name: string;
  project_slug: string;
  status: string;
  started_by: string;
  pipeline_number: number;
  created_at: string;
  stopped_at: string;
  jobs: Job[];
}

export interface Job {
  dependencies: any[];
  job_number: number;
  id: string;
  started_at: string;
  name: string;
  project_slug: string;
  status: string;
  type: string;
  stopped_at: string;
}

export interface TestMetadata {
  pipeline_id: string;
  pipeline_vcs: Vcs;
  project_slug: string;
  workflow_id: string;
  workflow_name: string;
  job_id: string;
  job_number: number;
  job_started_at: string;
  job_stopped_at: string;
  message: string;
  source: string;
  run_time: number;
  file: string;
  result: string;
  name: string;
  classname: string;
}

export interface CircleCIOnReadInfo {
  org_slug: string;
  repoNamesToProjectIds: Map<string, string>;
  repoNamesToOrgIds: Map<string, string>;
  repoNames: string[];
  orgIds: string[];
  uses_github_or_gitlab: boolean;
}
