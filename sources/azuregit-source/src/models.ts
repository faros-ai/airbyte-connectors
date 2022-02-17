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

export interface Creator {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
  descriptor: string;
}

export interface Ref {
  id: string;
  name: string;
  objectId: string;
  url: Project;
  creator: Creator;
}

export interface RefResponse {
  count: number;
  value: Ref[];
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
  refs: Ref[];
}

export interface RepositoryResponse {
  count: number;
  value: Repository[];
}
