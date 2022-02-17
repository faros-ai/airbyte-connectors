interface Href {
  href: string;
}
export interface Project {
  id: string;
  name: string;
  url: string;
  description: string;
  state: string;
  revision: number;
  visibility: string;
  lastUpdateTime: string;
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  project: Project;
  defaultBranch: string;
  size: number;
  remoteUrl: string;
  sshUrl: string;
  webUrl: string;
  isDisabled: boolean;
}

export interface RepositoryResponse {
  count: number;
  value: Repository[];
}
