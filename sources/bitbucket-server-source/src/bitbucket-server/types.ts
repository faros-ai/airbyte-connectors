import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface BitbucketServerConfig extends AirbyteConfig {
  readonly server_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly projects?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly cutoff_days?: number;
}

interface User {
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

export interface Repository {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly fullName: string;
  readonly isPrivate: boolean;
  readonly mainBranch: {readonly name: string};
  readonly links: {readonly htmlUrl: string};
  readonly workspace: {readonly slug: string};
}

export interface Workspace {
  readonly type: string;
  readonly slug: string;
  readonly name: string;
  readonly links: {readonly htmlUrl: string};
}

export interface WorkspaceUser {
  readonly user: User;
  readonly workspace: {readonly slug: string};
}
