import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

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

export class OktaCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
}

/** Okta converter base */
export abstract class OktaConverter extends Converter {
  /** Almost every Okta record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
