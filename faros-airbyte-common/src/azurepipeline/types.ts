interface Href {
  href: string;
}

interface PipelineLink {
  self: Href;
  web: Href;
}

interface RunLink {
  self: Href;
  web: Href;
  pipeline: Href;
}

interface RunPipeline {
  url: string;
  id: number;
  revision: number;
  name: string;
  folder: string;
}

interface Run {
  _links: RunLink;
  pipeline: RunPipeline;
  state: string;
  result: string;
  createdDate: string;
  finishedDate: string;
  url: string;
  id: number;
  name: string;
}

export interface RunResponse {
  count: number;
  value: Run[];
}

export interface Pipeline {
  id: number;
  revision: number;
  name?: string;
  url?: string;
  folder?: string;
  _links: PipelineLink;
  runs: Run[];
}

export interface PipelineResponse {
  count: number;
  value: Pipeline[];
}

interface BuildLink {
  self: Href;
  web: Href;
  sourceVersionDisplayUri: Href;
  timeline: Href;
  badge: Href;
}

interface BuildPlan {
  planId: string;
}

interface BuildDefinitionProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  revision: number;
  visibility: string;
  lastUpdateTime: string;
}

interface BuildDefinition {
  drafts: any[];
  id: number;
  name: string;
  url: string;
  uri: string;
  path: string;
  type: string;
  queueStatus: string;
  revision: number;
  project: BuildDefinitionProject;
}

interface BuildQueuePool {
  id: number;
  name: string;
  isHosted: boolean;
}

interface BuildQueue {
  id: number;
  name: string;
  pool: BuildQueuePool;
}

interface BuildRequestLinkAvatar {
  avatar: Href;
}

interface BuildRequestLink {
  avatar: BuildRequestLinkAvatar;
}

interface BuildRequest {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
  descriptor: string;
  _link: BuildRequestLink;
}

interface BuildLog {
  id: number;
  type: string;
  url: string;
}

export interface Repository {
  id: string;
  type: string;
  name: string;
  url: string;
  clean?: string;
  checkoutSubmodules: boolean;
}

interface ArtifactResource {
  data: string;
  downloadUrl: string;
  properties: any;
  type: string;
  url: string;
  _links: any;
}

interface BuildArtifact {
  id: number;
  name: string;
  resource: ArtifactResource;
  source: string;
}

export interface BuildArtifactResponse {
  count: number;
  value: BuildArtifact[];
}

interface BuildTimelineIssue {
  type: string;
  category?: any;
  message: string;
}

export interface BuildTimeline {
  previousAttempts: any[];
  id: string;
  parentId: string;
  type: string;
  name: string;
  startTime?: any;
  finishTime?: any;
  currentOperation?: any;
  percentComplete?: any;
  state: string;
  result: string;
  resultCode?: any;
  changeId: number;
  lastModified: Date;
  workerName?: any;
  queueId: number;
  order: number;
  details?: any;
  errorCount: number;
  warningCount: number;
  url?: any;
  log?: any;
  task?: any;
  attempt: number;
  identifier: string;
  issues: BuildTimelineIssue[];
}

export interface BuildTimelineResponse {
  records: BuildTimeline[];
}

export interface Build {
  _links: BuildLink;
  properties: any;
  tags: any[];
  validationResults: any[];
  plans: BuildPlan[];
  triggerInfo: any;
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime: string;
  startTime: string;
  finishTime: string;
  url: string;
  definition: BuildDefinition;
  buildNumberRevision: number;
  project: BuildDefinitionProject;
  uri: string;
  sourceBranch: string;
  sourceVersion: string;
  queue: BuildQueue;
  priority: string;
  reason: string;
  requestedFor: BuildRequest;
  requestedBy: BuildRequest;
  lastChangedDate: string;
  lastChangedBy: BuildRequest;
  orchestrationPlan: BuildPlan;
  logs: BuildLog;
  repository: Repository;
  keepForever: boolean;
  retainedByRelease: boolean;
  triggeredByBuild: any;
  artifacts: BuildArtifact[];
  jobs: BuildTimeline[];
  coverageStats: CoverageStats[];
}

export interface BuildResponse {
  count: number;
  value: Build[];
}

interface ReleaseByUser {
  id: string;
  displayName: string;
  uniqueName: string;
  url: string;
  imageUrl?: string;
}

interface ReleaseLink {
  self: Href;
  web: Href;
}

interface ReleaseProjectReference {
  id: string;
  name: string;
}

export interface Release {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn?: string;
  modifiedBy?: ReleaseByUser;
  createdBy: ReleaseByUser;
  variables: any;
  variableGroups: [any];
  description?: string;
  reason?: string;
  releaseNameFormat?: string;
  keepForever: boolean;
  definitionSnapshotRevision: number;
  logsContainerUrl: string;
  url: string;
  _links: ReleaseLink;
  tags: [any];
  projectReference: ReleaseProjectReference;
  properties: any;
}

export interface ReleaseResponse {
  count: number;
  value: Release[];
}

export interface CoverageStats {
  label: string;
  position: number;
  total: number;
  covered: number;
  isDeltaAvailable: boolean;
  delta: number;
}

interface CoverageData {
  coverageStats: CoverageStats[];
  buildPlatform: string;
  buildFlavor: string;
}

interface CoverageBuild {
  id: string;
  url: string;
}

export interface CoverageResponse {
  coverageData: CoverageData[];
  build: CoverageBuild;
  deltaBuild: any;
  status: string;
  coverageDetailedSummaryStatus: string;
}

export interface Tag {
  readonly name: string;
  readonly value: string;
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}

export enum BuildStateCategory {
  Unknown = 'Unknown',
  Canceled = 'Canceled',
  Failed = 'Failed',
  Success = 'Success',
  Running = 'Running',
  Queued = 'Queued',
  Custom = 'Custom',
}

export enum JobCategory {
  Custom = 'Custom',
  Script = 'Script',
  Manual = 'Manual',
}

export interface Repo {
  readonly provider: Provider;
  readonly url: string;
}

export interface RepoExtract {
  readonly org: string;
  readonly name: string;
}

export interface Provider {
  readonly name: RepoSource;
}
export interface Timestamps {
  createdAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface JobState {
  category: string;
  detail: string;
}

export enum UserTypeCategory {
  BOT = 'Bot',
  ORGANIZATION = 'Organization',
  USER = 'User',
  CUSTOM = 'Custom',
}

export enum DeploymentStatusCategory {
  Canceled = 'Canceled',
  Custom = 'Custom',
  Failed = 'Failed',
  Queued = 'Queued',
  Running = 'Running',
  RolledBack = 'RolledBack',
  Success = 'Success',
}

export interface DeploymentStatus {
  category: DeploymentStatusCategory;
  detail: string;
}
