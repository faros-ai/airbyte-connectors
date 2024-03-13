import {AirbyteLogger} from 'faros-airbyte-cdk';
import {RequestConfig} from 'jira.js';
import jira, {AgileClient, Version2Client, Version2Models} from 'jira.js';

import {
  AgileClientWithRetry,
  Version2ClientWithRetry,
  WithRetry,
} from './retry';

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
}
