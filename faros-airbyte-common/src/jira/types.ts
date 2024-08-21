import {AgileModels} from 'jira.js/out/agile';
import {Version2Models} from 'jira.js/out/version2';

export interface IssueCompact {
  readonly id?: string;
  readonly key: string;
  readonly fields?: any;
  readonly created?: Date;
  readonly updated?: Date;
  readonly boardId?: string;
  readonly additionalFields?: ReadonlyArray<[string, string]>;
  readonly updateAdditionalFields?: boolean;
}

export interface Issue extends IssueCompact {
  readonly type: string;
  readonly status: Status;
  readonly creator: string;
  readonly project: string;
  readonly priority: string;
  readonly labels: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<Dependency>;
  readonly subtasks: ReadonlyArray<string>;
  readonly parent?: Parent;
  readonly statusChanged?: Date;
  readonly statusChangelog: ReadonlyArray<[Status, Date]>;
  readonly keyChangelog: ReadonlyArray<[string, Date]>;
  readonly summary?: string;
  readonly description?: string;
  readonly assignees?: ReadonlyArray<Assignee>;
  readonly assigned?: Date;
  readonly points?: number;
  readonly epic?: string;
  readonly sprintInfo?: SprintInfo;
  readonly url: string;
  readonly resolution: string;
  readonly resolutionDate: Date;
}

export interface Parent {
  key: string;
  type?: string;
}

export interface Dependency {
  readonly key: string;
  readonly inward: string;
  readonly outward: string;
}

export interface Status {
  readonly category: string;
  readonly detail: string;
}

export interface Assignee {
  readonly uid: string;
  readonly assignedAt: Date;
}

export interface SprintHistory {
  readonly uid: string;
  readonly addedAt: Date;
  readonly removedAt?: Date;
}

export interface SprintInfo {
  readonly currentSprintId: string;
  readonly history: ReadonlyArray<SprintHistory>;
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
  readonly issue?: PullRequestIssue;
}

export interface Sprint extends AgileModels.Sprint {
  // The date the sprint is opened in Jira Server
  readonly activatedDate?: string;
  // Board sprint is associated that can be not originBoardId
  // https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report/
  readonly boardId: number;
}

export interface SprintReport {
  readonly sprintId: number;
  readonly boardId: string;
  readonly completeDate: Date;
  readonly issues: SprintIssue[];
}

export interface SprintIssue {
  readonly key: string;
  readonly points: number;
  readonly plannedPoints: number;
  readonly status: string;
  readonly addedDuringSprint?: boolean;
}

export interface IssueField {
  readonly id: string;
  readonly name: string;
  readonly value?: string;
}

export interface User extends Version2Models.User {
  id: string;
}

export interface Board extends AgileModels.Board {
  uid: string;
  projectKey: string;
}

export interface ProjectVersion extends Version2Models.Version {
  projectKey: string;
}

export interface IssueProjectVersion {
  readonly key: string;
  readonly projectKey: string;
  readonly projectVersionId: string;
}

export interface FarosProject {
  key: string;
  boardUids: string[];
}

export interface Team {
  readonly id: string;
  readonly displayName: string;
}

export interface TeamMembership {
  readonly teamId: string;
  readonly memberId: string;
}
