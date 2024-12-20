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
  startDate?: string;
  [key: string]: any;
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
  created: string;
  activated?: any;
  statusChanged: string;
  lastLogin: string;
  lastUpdated: string;
  passwordChanged: string;
  type: Type;
  profile: Profile;
  credentials: Credentials;
  _links: Links;
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
  created: string;
  lastUpdated: string;
  lastMembershipUpdated: string;
  objectClass: string[];
  type: string;
  profile: GroupProfile;
  _links: GroupLinks;
  usersOfGroup: string[];
}
