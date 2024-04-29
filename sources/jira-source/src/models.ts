import {Version2Models} from 'jira.js/out/version2';

export interface Issue {
  readonly id?: string;
  readonly key: string;
  readonly fields?: any;
  readonly created?: Date;
  readonly updated?: Date;
  readonly boardId?: string;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GIT_FOR_JIRA_CLOUD = 'GitForJiraCloud',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}

export interface Repo {
  readonly source: RepoSource;
  readonly org: string;
  readonly name: string;
}

export interface PullRequestIssue {
  readonly key: string;
  readonly updated: Date;
  readonly project: string;
}

export interface PullRequest {
  readonly repo: Repo;
  readonly number: number;
  readonly issue: PullRequestIssue;
}

export interface SprintReport {
  readonly id: number;
  readonly boardId?: string;
  readonly projectKey?: string;
  readonly completedAt?: Date;
  readonly completedPoints?: number;
  readonly completedInAnotherSprintPoints?: number;
  readonly notCompletedPoints?: number;
  readonly puntedPoints?: number;
  readonly plannedPoints?: number;
}

export interface User extends Version2Models.User {
  id: string;
}
