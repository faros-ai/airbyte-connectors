interface Links {
  web: string;
  api: string;
}
interface Actor {
  name: string;
  type: string;
}

interface Title {
  type: string;
  content: string;
}

export interface IncidentTimeline {
  id: string;
  group: string;
  type: string;
  eventTime: string;
  hidden: boolean;
  actor: Actor;
  title: Title;
}
export interface IncidentTimelineEntry {
  entries: [IncidentTimeline];
}
interface Responder {
  type: string;
  id: string;
}
export interface Incident {
  id: string;
  description: string;
  impactedServices: string[];
  tinyId: string;
  message: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  priority: string;
  ownerTeam: string;
  responders: Responder[];
  extraProperties: any;
  links: Links;
  impactStartDate: string;
  actions: string[];
  timelines: IncidentTimeline[];
}

interface Integration {
  type: string;
  id: string;
  name: string;
}

interface Report {
  ackTime: number;
  closeTime: number;
  acknowledgedBy: string;
  closedBy: string;
}

export interface Alert {
  id: string;
  tinyId: string;
  alias: string;
  message: string;
  status: string;
  acknowledged: boolean;
  isSeen: boolean;
  tags: string[];
  snoozed: boolean;
  snoozedUntil: string;
  count: number;
  lastOccurredAt: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  owner: string;
  priority: string;
  responders: Responder[];
  integration: Integration;
  report: Report;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  links: Links;
}

interface Role {
  id: string;
  name: string;
}
interface UserAddress {
  country: string;
  state: string;
  city: string;
  line: string;
  zipCode: string;
}

export interface User {
  blocked: boolean;
  verified: boolean;
  id: string;
  username: string;
  fullName: string;
  role: Role;
  timeZone: string;
  locale: string;
  userAddress: UserAddress;
  createdAt: string;
}

export interface PageInfo {
  first: string;
  last: string;
}

export interface PaginationParams {
  sort?: string;
  offset?: number;
  limit?: number;
}

export interface PaginateResponse<T> {
  totalCount: number;
  data: T[];
  pagination: PageInfo;
  took: number;
}
export interface IncidentTimeLinePaginateResponse {
  totalCount: number;
  data: IncidentTimelineEntry;
  pagination: PageInfo;
  took: number;
}
