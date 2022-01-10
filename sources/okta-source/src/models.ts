interface Type {
  id: string;
}

interface Profile {
  profileUrl?: string;
  lastName: string;
  zipCode?: string;
  preferredLanguage?: string;
  manager?: string;
  managerId?: string;
  city?: string;
  displayName?: string;
  nickName?: string;
  secondEmail?: string;
  honorificPrefix?: string;
  title?: string;
  locale?: string;
  login?: string;
  honorificSuffix?: string;
  firstName?: string;
  primaryPhone?: string;
  postalAddress?: string;
  mobilePhone?: string;
  streetAddress?: string;
  countryCode?: string;
  middleName?: string;
  state?: string;
  department?: string;
  email?: string;
  userType?: string;
}

interface Email {
  value: string;
  status: string;
  type: string;
}

interface Provider {
  type: string;
  name: string;
}

interface Credentials {
  password?: string;
  emails: Email[];
  provider: Provider;
}

interface Self {
  href: string;
}

interface Links {
  self: Self;
}

export interface GroupOfUser {
  id: string;
}

export interface User {
  id: string;
  status: string;
  created: Date;
  activated?: any;
  statusChanged: Date;
  lastLogin: Date;
  lastUpdated: Date;
  passwordChanged: Date;
  type: Type;
  profile: Profile;
  credentials: Credentials;
  _links: Links;
  groupsOfUser: GroupOfUser[];
}

export interface GroupProfile {
  name: string;
  description?: any;
}

export interface Logo {
  name: string;
  href: string;
  type: string;
}

export interface Users {
  href: string;
}

export interface Apps {
  href: string;
}

export interface GroupLinks {
  logo: Logo[];
  users: Users;
  apps: Apps;
}
export interface UserOfGroup {
  id: string;
}
export interface Group {
  item: any;
  id: string;
  created: Date;
  lastUpdated: Date;
  lastMembershipUpdated: Date;
  objectClass: string[];
  type: string;
  profile: GroupProfile;
  _links: GroupLinks;
  usersOfGroup: UserOfGroup[];
}

interface Actor {
  id: string;
  type: string;
  alternateId: string;
  displayName: string;
  detailEntry?: any;
}

interface UserAgent {
  rawUserAgent: string;
  os: string;
  browser: string;
}

interface Geolocation {
  lat: number;
  lon: number;
}

interface GeographicalContext {
  city: string;
  state: string;
  country: string;
  postalCode: string;
  geolocation: Geolocation;
}

interface Client {
  userAgent: UserAgent;
  zone: string;
  device: string;
  id: string;
  ipAddress: string;
  geographicalContext: GeographicalContext;
}

interface AuthenticationContext {
  authenticationProvider?: any;
  credentialProvider?: any;
  credentialType?: any;
  issuer?: any;
  interface?: any;
  authenticationStep: number;
  externalSessionId: string;
}

interface Outcome {
  result: string;
  reason?: any;
}

interface SecurityContext {
  asNumber: number;
  asOrg: string;
  isp: string;
  domain: string;
  isProxy: boolean;
}

interface DebugData {
  requestId: string;
  requestUri: string;
  url: string;
}

interface DebugContext {
  debugData: DebugData;
}

interface Transaction {
  type: string;
  id: string;
  detail: object;
}

interface Geolocation2 {
  lat: number;
  lon: number;
}

interface GeographicalContext2 {
  city: string;
  state: string;
  country: string;
  postalCode: string;
  geolocation: Geolocation2;
}

interface IpChain {
  ip: string;
  geographicalContext: GeographicalContext2;
  version: string;
  source?: any;
}

interface Request {
  ipChain: IpChain[];
}

interface Target {
  id: string;
  type: string;
  alternateId: string;
  displayName: string;
  detailEntry?: any;
}

export interface LogEvent {
  actor: Actor;
  client: Client;
  device?: any;
  authenticationContext: AuthenticationContext;
  displayMessage: string;
  eventType: string;
  outcome: Outcome;
  published: Date;
  securityContext: SecurityContext;
  severity: string;
  debugContext: DebugContext;
  legacyEventType: string;
  transaction: Transaction;
  uuid: string;
  version: string;
  request: Request;
  target: Target[];
}
