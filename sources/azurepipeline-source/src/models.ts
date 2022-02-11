interface Href {
  href: string;
}

interface PipelineLink {
  self: Href;
  web: Href;
}

export interface Pipeline {
  id: number;
  revision: number;
  name?: string;
  url?: string;
  folder?: string;
  _links: PipelineLink;
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

interface Repository {
  id: string;
  type: string;
  name: string;
  url: string;
  clean?: string;
  checkoutSubmodules: boolean;
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
}

export interface BuildResponse {
  count: number;
  value: Build[];
}
