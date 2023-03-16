// TODO: Deduplicate shared types for other source/converter pairs

import {FileDiff} from '../common';

type HRefs = {self?: {href: string}[]};
export function selfHRef(links: HRefs): string | undefined {
  return links.self?.find((l) => l.href)?.href;
}

export interface Commit {
  readonly id: string;
  readonly author: User;
  readonly authorTimestamp: number;
  readonly committer: User;
  readonly committerTimestamp: number;
  readonly message: string;
  readonly computedProperties: {
    readonly repository: {readonly fullName: string};
  };
}

export interface PullRequestActivity {
  readonly id: number;
  readonly createdDate: number;
  readonly user: User;
  readonly action: string;
  readonly computedProperties: {
    readonly pullRequest: {
      readonly id: number;
      readonly repository: {readonly fullName: string};
      readonly updatedDate: number;
    };
  };
}

interface PullRequestComment extends PullRequestActivity {
  readonly comment: {
    readonly text: string;
    readonly createdDate: number;
    readonly updatedDate: number;
  };
}

export function isPullRequestComment(
  activity: PullRequestActivity
): activity is PullRequestComment {
  return activity.action === 'COMMENTED';
}

interface PullRequestMerge extends PullRequestActivity {
  readonly commit: Commit;
}

export function isPullRequestMerge(
  activity: PullRequestActivity
): activity is PullRequestMerge {
  return activity.action === 'MERGED';
}

export function isPullRequestReview(activity: PullRequestActivity): boolean {
  return (
    activity.action === 'APPROVED' ||
    activity.action === 'DECLINED' ||
    activity.action === 'REVIEWED'
  );
}

export interface PullRequestDiff {
  readonly files: ReadonlyArray<FileDiff>;
  readonly computedProperties: {
    readonly pullRequest: {
      readonly id: number;
      readonly repository: {readonly fullName: string};
      readonly updatedDate: number;
    };
  };
}

export interface PullRequest {
  readonly author: {readonly user: User};
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly state: string;
  readonly createdDate: number;
  readonly updatedDate: number;
  readonly toRef: {
    readonly repository: Repository;
  };
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

export interface Tag {
  readonly id: string;
  readonly displayId: string;
  readonly type: string;
  readonly latestCommit: string;
  readonly latestChangeset: string;
  readonly hash: string;
  readonly computedProperties: {
    readonly repository: {readonly fullName: string};
  };
}

export interface Project {
  readonly key: string;
  readonly name: string;
  readonly links: HRefs;
}

export interface User {
  readonly displayName: string;
  readonly emailAddress: string;
  readonly name: string;
  readonly slug: string;
  readonly links: HRefs;
}

export interface ProjectUser {
  readonly user: User;
  readonly project: {readonly key: string};
}
