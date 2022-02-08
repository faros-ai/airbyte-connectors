export interface AuthorizationResponse {
  data: {
    token_type: string;
    expires_in: number;
    ext_expires_in: number;
    access_token: string;
  };
}

export interface UserResponse {
  value: User[];
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
  manager?: User;
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
  members: User[];
  owners: User[];
}
