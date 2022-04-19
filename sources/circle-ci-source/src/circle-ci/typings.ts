export interface CircleCIConfig {
  readonly token: string;
  readonly url: string;
  readonly rejectUnauthorized: boolean;
}

export interface Project {
  readonly uid: string;
  readonly name: string;
  readonly vcsOrgName: string;
  readonly vcsProvider: string;
}

export interface Pipeline {
  readonly uid: string;
  readonly projectSlug: string;
  readonly number: number;
  readonly state: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly commitSha: string;
  readonly vcsProvider: string;
  workflows: Workflow[];
}

export interface Workflow {
  readonly uid: string;
  readonly name: string;
  readonly createdAt?: string;
  readonly stoppedAt?: string;
  readonly status: string;
  jobs: Job[];
}

export interface Job {
  readonly uid: string;
  readonly name: string;
  readonly type: string;
  readonly startedAt?: string;
  readonly stoppedAt?: string;
  readonly status: string;
  readonly number?: number;
}
