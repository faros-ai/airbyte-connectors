export declare type LabelStats = {
  num_epics: number;
  num_points_completed: number;
  num_points_in_progress: number;
  num_points_total: number;
  num_stories_completed: number;
  num_stories_in_progress: number;
  num_stories_total: number;
  num_stories_unestimated: number;
};

export declare type Label = {
  app_url: string;
  archived: boolean;
  color: string | null;
  created_at: string | null;
  description: string | null;
  entity_type: string;
  external_id: string | null;
  id: number;
  name: string;
  stats: LabelStats;
  updated_at: string | null;
};
export declare type ID = string | number;

export declare type EpicStats = {
  average_cycle_time: number;
  average_lead_time: number;
  last_story_update: string | null;
  num_points: number;
  num_points_done: number;
  num_points_started: number;
  num_points_unstarted: number;
  num_stories_done: number;
  num_stories_started: number;
  num_stories_unestimated: number;
  num_stories_unstarted: number;
};

export declare type EpicSlim = {
  id: number;
  app_url: string;
  archived: boolean;
  completed: boolean;
  completed_at: Date | null;
  completed_at_override: Date | null;
  created_at: Date | null;
  deadline: Date | null;
  entity_type: string;
  epic_state_id: number;
  external_id: string | null;
  follower_ids: Array<ID>;
  group_mention_ids: Array<ID>;
  labels: Array<Label>;
  member_mention_ids: Array<ID>;
  mention_ids: Array<ID>;
  milestone_id: number | null;
  name: string;
  owner_ids: Array<ID>;
  planned_start_date: Date | null;
  position: number;
  project_ids: Array<number>;
  requested_by_id: ID;
  started: boolean;
  started_at: Date | null;
  started_at_override: Date | null;
  state: string;
  stats: EpicStats;
  updated_at: Date | null;
};

export declare type EpicStates = 'to do' | 'in progress' | 'done';

export declare type Epic = {
  app_url: string;
  archived: string;
  comments: Array<Record<string, any>>;
  completed: boolean;
  completed_at: string | null;
  completed_at_override?: string | null;
  created_at: string | null;
  deadline: string | null;
  description: string;
  entity_type: string;
  epic_state_id: number;
  external_id: string | null;
  follower_ids: Array<ID>;
  group_id: string | null;
  group_mention_ids: Array<ID>;
  id: number;
  labels: Array<Label>;
  member_mention_ids: Array<ID>;
  mention_ids: Array<ID>;
  milestone_id: number | null;
  name: string;
  owner_ids: Array<ID>;
  planned_start_date: string | null;
  position: number;
  project_ids: Array<number>;
  requested_by_id: ID;
  started: boolean;
  started_at: string | null;
  started_at_override: string | null;
  state: EpicStates;
  stats: EpicStats;
  updated_at: string | null;
};

export declare type IterationStats = {
  average_cycle_time: number;
  average_lead_time: number;
  num_points: number;
  num_points_done: number;
  num_points_started: number;
  num_points_unstarted: number;
  num_stories_done: number;
  num_stories_started: number;
  num_stories_unestimated: number;
  num_stories_unstarted: number;
};

export declare type IterationStatus = 'unstarted' | 'started' | 'done';

export declare type Iteration = {
  created_at: string;
  description: string;
  end_date: string;
  entity_type: string;
  follower_ids: Array<ID>;
  group_mention_ids: Array<ID>;
  id: number;
  labels: Array<Label>;
  member_mention_ids: Array<ID>;
  mention_ids: Array<ID>;
  name: string;
  start_date: string;
  stats: IterationStats;
  status: IterationStatus;
  updated_at: string;
};

export declare type IterationChange = {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  follower_ids?: Array<ID>;
};

export declare type Repository = {
  created_ad: string;
  entity_type: string;
  external_id?: string | null;
  full_name: string;
  id: number;
  name: string;
  type: string;
  updated_at: string | null;
  url: string;
};

export declare type Member = {
  id: ID;
  created_at: string;
  updated_at: string;
  role: string;
  disabled: boolean;
  profile: Profile;
  overrides: {
    email_address?: string;
    gravatar_hash?: string;
    display_icon?: string;
  };
};

export declare type Profile = {
  deactivated: boolean;
  display_icon: any;
  email_address: string | null;
  entity_type: string;
  gravatar_hash: string | null;
  id: ID;
  mention_name: string;
  name: string | null;
  two_factor_auth_activated: boolean;
};

export declare type ProjectStats = {
  num_points: number;
  num_stories: number;
};

export declare type Project = {
  abbreviation: string | null;
  archived: boolean;
  color: string | null;
  created_at: string | null;
  days_to_thermometer: number;
  description: string | null;
  entity_type: string;
  external_id: string | null;
  follower_ids: Array<ID>;
  id: number;
  iteration_length: number;
  name: string;
  show_thermometer: boolean;
  start_time: string;
  stats: ProjectStats;
  team_id: number;
  updated_at: string | null;
};

export declare type ProjectChange = {
  name?: string;
  team_id?: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
  color?: string;
  abbreviation?: string;
  archived?: boolean;
  start_time?: string;
  show_thermometer?: boolean;
  days_to_thermometer?: string;
  external_id?: string;
  follower_ids?: Array<ID>;
};

export declare type StoryType = 'bug' | 'chore' | 'feature';

export interface Story {
  app_url: string;
  archived: boolean;
  blocked: boolean;
  blocker: boolean;
  branches: Array<Branch>;
  comments: Array<Comment>;
  commits: Array<Commit>;
  completed: boolean;
  completed_at: string | null;
  completed_at_override: string | null;
  created_at: string;
  cycle_time: number;
  deadline: string | null;
  description: string;
  entity_type: string;
  epic_id: number | null;
  estimate: number | null;
  external_id: string | null;
  external_links: Array<string>;
  files: Array<File>;
  follower_ids: Array<ID>;
  id: number;
  iteration_id: number | null;
  labels: Array<Label>;
  lead_time: number;
  linked_files: Array<LinkedFile>;
  member_mention_ids: Array<ID>;
  mention_ids: Array<ID>;
  moved_at: string | null;
  name: string;
  owner_ids: Array<ID>;
  position: number;
  previous_iteration_ids: Array<number>;
  project_id: number;
  pull_requests: Array<PullRequest>;
  requested_by_id: ID;
  started: boolean;
  started_at: string | null;
  started_at_override: string | null;
  story_type: StoryType;
  tasks: Array<Task>;
  task_ids: Array<ID>;
  updated_at: string | null;
  workflow_state_id: number;
  readonly story_links: Array<StoryLink>;
}

export declare type StoryLinkVerb = 'blocks' | 'duplicates' | 'relates to';

export declare type StoryLink = {
  id: ID;
  created_at: string;
  updated_at: string;
  type: string;
  subject_id: ID;
  object_id: ID;
  verb: StoryLinkVerb;
};

export declare type Branch = {
  created_at: string | null;
  deleted: boolean;
  entity_type: string;
  id: number | null;
  merged_branch_ids: Array<number>;
  name: string;
  persistent: boolean;
  pull_requests: Array<Record<string, any>>;
  repository_id: number | null;
  updated_at: string | null;
  url: string;
};

export declare type Commit = {
  author_email: string;
  author_id: ID | null;
  author_identity: Record<string, any>;
  created_at: string;
  entity_type: string;
  hash: string;
  id: number | null;
  merged_branch_ids: Array<number>;
  message: string;
  repository_id: number | null;
  timestamp: string;
  updated_at: string | null;
  url: string;
};

export declare type PullRequestLabel = {
  color: string;
  description: string | null;
  entity_type: string;
  id: number;
  name: string;
};

export declare type PullRequest = {
  branch_id: number;
  branch_name: string;
  build_status: string;
  closed: boolean;
  created_at: string;
  draft: boolean;
  entity_type: string;
  id: number;
  merged: boolean;
  num_added: number;
  num_commits: number;
  num_modified: number | null;
  num_removed: number;
  number: number;
  repository_id: number;
  review_status: string;
  target_branch_id: number;
  target_branch_name: string;
  title: string;
  updated_at: string;
  url: string;
  vcs_labels: Array<PullRequestLabel> | null;
};

export declare type LinkedFileType =
  | 'google url'
  | 'dropbox'
  | 'box'
  | 'onedrive';

export declare type LinkedFile = {
  content_type: string | null;
  created_at: string;
  description: string | null;
  entity_type: string;
  group_mention_ids: Array<ID>;
  id: number;
  member_mention_ids: Array<ID>;
  mention_ids: Array<ID>;
  name: string;
  size: number | null;
  story_ids: Array<number>;
  thumbnail_url: string | null;
  type: string;
  updated_at: string;
  uploader_id: ID;
  url: string;
};

export declare type Task = {
  complete: boolean;
  completed_at: string | null;
  created_at: string;
  description: string;
  entity_type: string;
  external_id?: string | null;
  group_mention_ids: Array<ID>;
  id: number;
  member_mention_ids: Array<ID>;
  mention_ids?: Array<ID>;
  owner_ids: Array<ID>;
  position: number;
  story_id: number;
  updated_at: string | null;
};

export interface TaskType {
  category: string;
  detail?: string;
}

export enum EpicStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
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

export enum SprintState {
  Active = 'Active',
  Closed = 'Closed',
  Future = 'Future',
  Default = 'Default',
}
