export interface Project {
  readonly slug: string;
  readonly organization_name: string;
  readonly organization_id: string;
  readonly name: string;
  readonly id: string;
  readonly organization_slug: string;
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
  started_at: Date;
  name: string;
  project_slug: string;
  status: string;
  type: string;
  stopped_at: string;
}
