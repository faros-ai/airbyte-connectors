export interface CommonKey {
  readonly id: string;
  readonly name: string;
}

export interface Assignee extends CommonKey {
  readonly createdAt: string;
}

export interface Label extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
}

export interface User extends CommonKey {
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface Project extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly updatedAt: string;
  readonly progress: number;
}

export interface Cycle extends CommonKey {
  readonly number: number;
  readonly progress: number;
  readonly createdAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly completedAt: string;
}

export interface Team extends CommonKey {
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly members: [string];
  readonly issues: [string];
}

export interface IssueHistory {
  readonly actor?: {
    id: string;
  };
  readonly createdAt: string;
  readonly fromState: CommonKey;
  readonly toState: CommonKey;
}

export interface Issue {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly priority: number;
  readonly url: string;
  readonly state: CommonKey;
  readonly history: [IssueHistory];
  readonly parent: {
    id: string;
  };
  readonly assignee: Assignee;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly labels: [CommonKey];
  readonly project: CommonKey;
  readonly cycle: {
    id: string;
  };
  readonly creator: {
    id: string;
  };
}

export interface TaskType {
  category: string;
  detail?: string;
}

export enum TaskCategory {
  Bug = 'Bug',
  Custom = 'Custom',
  Story = 'Story',
  Task = 'Task',
}

export enum TaskStatusCategory {
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

export interface TaskStatus {
  category: TaskStatusCategory;
  detail: string;
}

export interface TaskStatusChange {
  status: TaskStatus;
  changedAt: Date;
}

export interface TaskField {
  name: string;
  value: string;
}

export enum SprintState {
  Active = 'Active',
  Closed = 'Closed',
  Future = 'Future',
  Default = 'Default',
}

export enum EpicStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}
