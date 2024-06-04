import {AirbyteLogger} from 'faros-airbyte-cdk';
import jira, {
  AgileClient,
  RequestConfig,
  Version2Client,
  Version2Models,
} from 'jira.js';

import {
  AgileClientWithRetry,
  Version2ClientWithRetry,
  WithRetry,
} from './retry';

const GRAPHQL_PATH = '/gateway/api/graphql';

/** Client that extends the jira.js clients with retries and internal APIs */
export class JiraClient {
  readonly v2: Version2ClientWithRetry;
  readonly agile: AgileClientWithRetry;

  constructor(
    cfg: jira.Config & {
      readonly maxRetries: number;
      readonly logger?: AirbyteLogger;
    }
  ) {
    const maxAttempts = cfg.maxRetries + 1;

    // Compose new client classes with WithRetry functionality
    const Version2ClientWithRetries = WithRetry(
      Version2Client,
      maxAttempts,
      cfg.logger
    );
    const AgileClientWithRetries = WithRetry(
      AgileClient,
      maxAttempts,
      cfg.logger
    );

    this.v2 = new Version2ClientWithRetries(cfg);
    this.agile = new AgileClientWithRetries(cfg);
  }

  async graphql(query: string, variables?: any): Promise<any> {
    const config: RequestConfig = {
      url: GRAPHQL_PATH,
      method: 'POST',
      data: {query, variables},
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  async getDevStatusSummary(issueId: string): Promise<any> {
    const config: RequestConfig = {
      url: '/rest/dev-status/1.0/issue/summary',
      method: 'GET',
      params: {issueId},
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  async getDevStatusDetail(
    issueId: string,
    applicationType: string,
    dataType: string
  ): Promise<any> {
    const config: RequestConfig = {
      url: '/rest/dev-status/1.0/issue/detail',
      method: 'GET',
      params: {issueId, applicationType, dataType},
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  async getSprintReport(boardId: string, sprintId: number): Promise<any> {
    const config: RequestConfig = {
      url: '/rest/greenhopper/latest/rapid/charts/sprintreport',
      method: 'GET',
      params: {rapidViewId: boardId, sprintId},
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  /** This method is for Jira Server. GetAllProjects is deprecated in Cloud */
  async getAllProjects(): Promise<ReadonlyArray<Version2Models.Project>> {
    const config: RequestConfig = {
      url: '/rest/api/2/project',
      method: 'GET',
      params: {expand: 'description'},
    };
    return await this.v2.sendRequest<ReadonlyArray<Version2Models.Project>>(
      config,
      undefined
    );
  }

  /** This method is for Jira Server only to enable getting inactive users */
  // https://docs.atlassian.com/software/jira/docs/api/REST/8.20.14/#api/2/user-findUsers
  async searchUsers(
    username?: string,
    startAt?: number,
    maxResults?: number,
    includeInactive = true
  ): Promise<any> {
    const config: RequestConfig = {
      url: '/rest/api/2/user/search',
      method: 'GET',
      params: {
        username,
        includeInactive,
        startAt,
        maxResults,
      },
    };

    return await this.v2.sendRequest<any>(config, undefined);
  }

  getStats(): {[key: string]: number} {
    const v2Stats = this.v2.getStats();
    const agileStats = this.agile.getStats();
    const totalCalls = v2Stats.totalCalls + agileStats.totalCalls;
    return {
      ...v2Stats,
      ...agileStats,
      totalCalls,
    };
  }

  async getTeamMemberships(
    orgId: string,
    teamId: string,
    maxResults?: number,
    cursor?: string
  ): Promise<any> {
    const config: RequestConfig = {
      url: `/gateway/api/public/teams/v1/org/${orgId}/teams/${teamId}/members`,
      method: 'POST',
      data: {
        first: maxResults,
        after: cursor,
      },
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  /** This method is for getting teams from Jira Server */
  async getTeams(page?: number, size?: number): Promise<any> {
    const config: RequestConfig = {
      url: `/rest/teams-api/1.0/team?page=${page}&size=${size}`,
      method: 'GET',
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  /** This method is for getting resources from Jira Server, which represent
   * a team membership (resource contains a person but does not include user data) */
  async getResources(page?: number, size?: number): Promise<any> {
    const config: RequestConfig = {
      url: `/rest/teams-api/1.0/resource?page=${page}&size=${size}`,
      method: 'GET',
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }

  /** This method gets person from Jira Server containing Jira User data */
  async getPerson(id: string): Promise<any> {
    const config: RequestConfig = {
      url: `/rest/teams-api/1.0/person/${id}`,
      method: 'GET',
    };
    return await this.v2.sendRequest<any>(config, undefined);
  }
}
