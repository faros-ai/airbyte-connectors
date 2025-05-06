export interface OrgRow {
  readonly employeeId: string;
  readonly fullName?: string;
  readonly email?: string;
  readonly teamId?: string;
  readonly level?: string;
  readonly joinedAt?: string;
  readonly terminatedAt?: string;
  readonly location?: string;
  readonly locationName?: string;
  readonly inactive?: string;
  readonly ignored?: string;
  readonly title?: string;
  readonly role?: string;
  readonly type?: string;
  readonly amsId?: string;
  readonly calId?: string;
  readonly imsId?: string;
  readonly surveyId?: string;
  readonly tmsId?: string;
  readonly tmsId_Jira?: string;
  readonly vcsId?: string;
  readonly vcsId_GitHub?: string;
  readonly vcsId_BitBucket?: string;
}

export interface TeamRow {
  readonly teamId: string;
  readonly teamName?: string;
  readonly teamDescription?: string;
  readonly parentTeamId?: string;
  readonly teamLeadId?: string;
  readonly surveyTeamId?: string;
  readonly communicationChannel_Email?: string;
  readonly communicationChannel_Slack?: string;
  readonly communicationChannel_Teams?: string;
  readonly communicationChannel_Discord?: string;
}

export interface ToolRow {
  readonly tool?: string;
  readonly employeeId?: string;
  readonly activatedAt?: string;
  readonly deactivatedAt?: string;
}

export const EmployeeTypeMap = {
  fulltime: 'FullTime',
  parttime: 'PartTime',
  intern: 'Intern',
  contractor: 'Contractor',
  freelance: 'Freelance',
};

export const ToolMap = {
  githubcopilot: 'GitHubCopilot',
};

export type IdentityNamespace =
  | 'ams'
  | 'cal'
  | 'ims'
  | 'survey'
  | 'tms'
  | 'vcs';

export type Source = {
  [key in IdentityNamespace]?: string;
};
