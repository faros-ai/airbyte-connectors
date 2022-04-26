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
}

export interface Owner {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly href: string;
}
