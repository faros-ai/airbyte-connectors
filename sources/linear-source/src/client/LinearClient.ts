import axios from 'axios';

import {
  Attachment,
  AuditEntry,
  Comment,
  Document,
  Issue,
  IssueHistory,
  IssueLabel,
  IssueRelation,
  Milestone,
  Organization,
  Project,
  ProjectLink,
  ProjectUpdate,
  Team,
  TeamKey,
  TeamMembership,
  User,
  WorkflowState,
} from './types';

const LINEAR_API_BASE_URL = 'https://api.linear.app/export/';

/**
 * Linear client configuration
 */
export type Config = {
  // access token provided in linear airbyte integration
  api_key: string;
};

/*
 * The supported entity types.
 */
export type EntityType =
  | 'issue'
  | 'organization'
  | 'team'
  | 'teamkey'
  | 'teammembership'
  | 'user'
  | 'milestone'
  | 'project'
  | 'projectupdate'
  | 'projectlink'
  | 'issuehistory'
  | 'issuelabel'
  | 'issuerelation'
  | 'attachment'
  | 'auditentry'
  | 'cycle'
  | 'workflowstate'
  | 'document'
  | 'comment';
/**
 * Thin client on top of the rest export api to fetch different resources.
 */
export class LinearClient {
  public constructor(private readonly config: Config) {}

  /**
   * @returns List of all issues in organization.
   */
  public async issues(): Promise<Issue[]> {
    return await this.fetchEntities<Issue>('issue');
  }

  /**
   * @returns List of all teams in organization.
   */
  public async teams(): Promise<Team[]> {
    return await this.fetchEntities<Team>('team');
  }

  /**
   * @returns List of all users in organization.
   */
  public async users(): Promise<User[]> {
    return await this.fetchEntities<User>('user');
  }

  /**
   * @returns List of all team keys in organization.
   */
  public async teamKeys(): Promise<TeamKey[]> {
    return await this.fetchEntities<TeamKey>('teamkey');
  }

  /**
   * @returns List of all team memberships in organization.
   */
  public async teamMemberships(): Promise<TeamMembership[]> {
    return await this.fetchEntities<TeamMembership>('teammembership');
  }

  /**
   * @returns List of all milestones in organization.
   */
  public async milestones(): Promise<Milestone[]> {
    return await this.fetchEntities<Milestone>('milestone');
  }

  /**
   * @returns List of all projects in organization.
   */
  public async projects(): Promise<Project[]> {
    return await this.fetchEntities<Project>('project');
  }

  /**
   * @returns List of all projects in organization.
   */
  public async projectUpdates(): Promise<ProjectUpdate[]> {
    return await this.fetchEntities<ProjectUpdate>('projectupdate');
  }

  /**
   * @returns List of all project links in organization.
   */
  public async projectLinks(): Promise<ProjectLink[]> {
    return await this.fetchEntities<ProjectLink>('projectlink');
  }

  /**
   * @returns List of all issue history entries in organization.
   */
  public async issueHistory(): Promise<IssueHistory[]> {
    return await this.fetchEntities<IssueHistory>('issuehistory');
  }

  /**
   * @returns List of all issue labels in organization.
   */
  public async issueLabels(): Promise<IssueLabel[]> {
    return await this.fetchEntities<IssueLabel>('issuelabel');
  }

  /**
   * @returns List of all issue relations in organization.
   */
  public async issueRelations(): Promise<IssueRelation[]> {
    return await this.fetchEntities<IssueRelation>('issuerelation');
  }

  /**
   * @returns List of all attachments in organization.
   */
  public async attachments(): Promise<Attachment[]> {
    return await this.fetchEntities<Attachment>('attachment');
  }

  /**
   * @returns List of all audit entries in organization.
   */
  public async auditEntries(): Promise<AuditEntry[]> {
    return await this.fetchEntities<AuditEntry>('auditentry');
  }

  /**
   * @returns List of all comments in organization.
   */
  public async comments(): Promise<Comment[]> {
    return await this.fetchEntities<Comment>('comment');
  }

  /**
   * @returns List of all cycles in organization.
   */
  public async cycles(): Promise<Comment[]> {
    return await this.fetchEntities<Comment>('cycle');
  }

  /**
   * @returns List of all workflow states in organization.
   */
  public async workflowStates(): Promise<WorkflowState[]> {
    return await this.fetchEntities<WorkflowState>('workflowstate');
  }

  /**
   * @returns List of all workflow states in organization.
   */
  public async documents(): Promise<Document[]> {
    return await this.fetchEntities<Document>('document');
  }

  /**
   *
   * @returns Organization associated with api token. The response will always contain a single organization.
   */
  public async organizations(): Promise<Organization[]> {
    return await this.fetchEntities<Organization>('organization');
  }

  public async checkConnection(): Promise<void> {
    await axios({
      method: 'GET',
      baseURL: LINEAR_API_BASE_URL,
      url: 'checkConnection',
      headers: {
        Authorization: this.config.api_key,
      },
    });
  }

  private async fetchEntities<T>(entityType: EntityType): Promise<T[]> {
    const response = await axios({
      method: 'GET',
      baseURL: LINEAR_API_BASE_URL,
      url: entityType,
      headers: {
        Authorization: this.config.api_key,
      },
    });
    return response.data;
  }
}
