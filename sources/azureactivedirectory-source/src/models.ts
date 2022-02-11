export interface UserResponse {
  value: User[];
}

interface UserIdentity {
  signInType?: string;
  issuer: string;
  issuerAssignedId?: string;
}

export interface UserExtraInfo {
  department?: string;
  postalCode?: string;
  createdDateTime?: string;
  streetAddress?: string;
  identities: UserIdentity[];
}

export interface User {
  businessPhones: string[];
  displayName: string;
  givenName: string;
  jobTitle: string;
  mail: string;
  mobilePhone: string;
  officeLocation: string;
  preferredLanguage?: string;
  surname: string;
  userPrincipalName: string;
  id: string;
  department?: string;
  postalCode?: string;
  manager?: string;
  createdDateTime?: string;
  streetAddress?: string;
  identities: UserIdentity[];
}

export interface GroupResponse {
  value: Group[];
}

export interface Group {
  id: string;
  deletedDateTime?: string;
  classification?: string;
  createdDateTime: string;
  creationOptions: any[];
  description: string;
  displayName: string;
  expirationDateTime?: string;
  groupTypes: string[];
  isAssignableToRole?: string;
  mail?: string;
  mailEnabled: boolean;
  mailNickname: string;
  membershipRule?: string;
  membershipRuleProcessingState?: string;
  onPremisesDomainName?: string;
  onPremisesLastSyncDateTime?: string;
  onPremisesNetBiosName?: string;
  onPremisesSamAccountName?: string;
  onPremisesSecurityIdentifier?: string;
  onPremisesSyncEnabled?: string;
  preferredDataLocation?: string;
  preferredLanguage?: string;
  proxyAddresses: string[];
  renewedDateTime: Date;
  resourceBehaviorOptions: string[];
  resourceProvisioningOptions: string[];
  securityEnabled: boolean;
  securityIdentifier: string;
  theme?: string;
  visibility?: string;
  onPremisesProvisioningErrors: string[];
  members: string[];
  owners: string[];
}
