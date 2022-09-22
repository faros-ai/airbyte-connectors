export interface User {
  readonly accountId: string;
  readonly name: string;
  readonly displayName: string;
  readonly emailAddress?: string;
  readonly type: string;
  readonly links: {readonly htmlUrl: string};
}

type HRefs = {self?: {href: string}[]};
export function selfHRef(links: HRefs): string | undefined {
  return links.self?.find((l) => l.href)?.href;
}

export function repoFullName(projectKey: string, repoSlug: string): string {
  return `${projectKey}/${repoSlug}`;
}
export function toStreamUser(data: {[k: string]: any}): User {
  return {
    accountId: data.slug,
    displayName: data.displayName,
    emailAddress: data.emailAddress,
    name: data.name,
    links: {htmlUrl: selfHRef(data.links as HRefs)},
    type: 'user',
  };
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly date: number;
  readonly author: {readonly user: User};
  readonly repository: {readonly fullName: string};
}

export interface PullRequestActivity {
  readonly id: number;
  readonly createdDate: number;
  readonly user: User;
  readonly action: string;
  readonly pullRequest: {
    readonly id: number;
    readonly repository: {readonly fullName: string};
  };
}

export interface PullRequestComment extends PullRequestActivity {
  readonly comment: {
    readonly text: string;
    readonly author: User;
    readonly createdDate: number;
    readonly updatedDate: number;
  };
}

export interface PullRequest {
  readonly author: {readonly user: NewUser};
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly state: string;
  readonly createdDate: number;
  readonly updatedDate: number;
  readonly properties: {readonly commentCount: number};
  readonly links: HRefs;
  readonly computedProperties: {
    readonly repository: {readonly fullName: string};
  };
}

export interface Repository {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly project: Project;
  readonly public: boolean;
  readonly links: HRefs;
  readonly computedProperties: {
    readonly fullName: string;
    readonly mainBranch: string;
  };
}

export interface Project {
  readonly key: string;
  readonly name: string;
  readonly links: HRefs;
}

export interface NewUser {
  readonly displayName: string;
  readonly emailAddress: string;
  readonly name: string;
  readonly slug: string;
  readonly links: HRefs;
}

export interface ProjectUser {
  readonly user: NewUser;
  readonly project: {readonly key: string};
}
