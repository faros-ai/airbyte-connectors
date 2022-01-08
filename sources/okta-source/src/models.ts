interface Type {
  id: string;
}

interface Profile {
  firstName: string;
  lastName: string;
  mobilePhone?: any;
  secondEmail?: any;
  login: string;
  email: string;
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
}

interface GroupProfile {
  name: string;
  description: string;
}

interface Logo {
  name: string;
  href: string;
  type: string;
}

interface Users {
  href: string;
}

interface Apps {
  href: string;
}

interface Links {
  logo: Logo[];
  users: Users;
  apps: Apps;
}

export interface Group {
  id: string;
  created: Date;
  lastUpdated: Date;
  lastMembershipUpdated: Date;
  objectClass: string[];
  type: string;
  profile: GroupProfile;
  credentials: Credentials;
  _links: Links;
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
