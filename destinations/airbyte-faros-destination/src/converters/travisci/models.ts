export interface Repository {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly href: string;
  readonly private: boolean;
  readonly github_language: string | null;
  readonly default_branch: {
    readonly name: string;
  };
  readonly vcs_type: string;
  readonly vcs_name: string;
  readonly owner: Owner;
}

export interface Job {
  readonly id: number;
  readonly created_at: string;
  readonly finished_at: string;
  readonly started_at: string;
  readonly state: string;
  readonly href: string;
}

export interface Commit {
  readonly sha: string;
  readonly message: string;
  readonly compare_url: string;
  readonly committed_at: string;
}

export interface Build {
  readonly id: number;
  readonly number: string;
  readonly state: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly href: string;
  readonly jobs: Job[];
  readonly commit: Commit;
  readonly repository: {
    readonly name: string;
    readonly slug: string;
  };
  readonly created_by: {
    readonly login: string;
  };
}

export interface Owner {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly href: string;
  readonly type: string;
}

export interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

export interface VCSOrganizationKey {
  uid: string;
  source: string;
}

export interface VCSRepositoryKey {
  organization: VCSOrganizationKey;
  name: string;
}

export interface VCSCommitKey {
  repository: VCSRepositoryKey;
  sha: string;
}

export interface OrganizationKey {
  uid: string;
  source: string;
}

export interface PipelineKey {
  organization: OrganizationKey;
  uid: string;
}

export interface BuildKey {
  pipeline: PipelineKey;
  uid: string;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}
