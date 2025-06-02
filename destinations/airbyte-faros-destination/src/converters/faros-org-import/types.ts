export interface EmployeeRow {
  readonly employeeId: string;
  readonly fullName?: string;
  readonly email?: string;
  readonly teamId?: string; // Comma separated list of team IDs
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
  readonly amsId?: string; // Comma separated list of IDs
  readonly calId?: string; // Comma separated list of IDs
  readonly imsId?: string; // Comma separated list of IDs
  readonly surveyId?: string; // Comma separated list of IDs
  readonly tmsId?: string; // Comma separated list of IDs
  readonly tmsId_Jira?: string; // Comma separated list of IDs
  readonly vcsId?: string; // Comma separated list of IDs
  readonly vcsId_GitHub?: string; // Comma separated list of IDs
  readonly vcsId_BitBucket?: string; // Comma separated list of IDs
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
