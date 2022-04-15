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

export interface Service {
  id: string;
  name: string;
  description: string;
  teamId: string;
  tags: string[];
  links: Links;
  isExternal: boolean;
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

export enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentEventType {
  category: IncidentEventTypeCategory;
  detail: string;
}

export enum OpsGenieIncidentPriority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
}

export enum IncidentStatus {
  open = 'open',
  resolved = 'resolved',
  closed = 'closed',
}
export enum IncidentStatusCategory {
  Identified = 'Identified',
  Investigating = 'Investigating',
  Monitoring = 'Monitoring',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentPriority {
  category: IncidentPriorityCategory;
  detail: string;
}

export enum IncidentPriorityCategory {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Custom = 'Custom',
}
