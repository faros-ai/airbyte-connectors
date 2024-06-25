import {Octokit} from '@octokit/rest';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  CopilotUsageSummary,
  GitHubTool,
  Organization,
} from 'faros-airbyte-common/github';
import {FarosClient, paginatedQueryV2} from 'faros-js-client';
import fs from 'fs';
import {isEmpty, isNil, pick, toLower} from 'lodash';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {makeOctokitClient} from './octokit';
import {GitHubConfig} from './types';

const USER_TOOL_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'vcs-user-tool.gql'),
  'utf8'
);

export const DEFAULT_API_URL = 'https://prod.api.faros.ai';
export const DEFAULT_GRAPH = 'default';

export const PAGE_SIZE = 100;

export class GitHub {
  private static _instance: GitHub;
  private readonly octokitByInstallationOrg: Map<string, Octokit> = new Map();

  constructor(
    private readonly config: GitHubConfig,
    private readonly authOctokit: Octokit,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    let instance: GitHub = GitHub._instance;
    if (!instance) {
      const octokit = makeOctokitClient(cfg, undefined, logger);
      instance = new GitHub(cfg, octokit, logger);
      await instance.checkConnection();
      GitHub._instance = instance;
    }
    return instance;
  }

  private async octokit(org?: string): Promise<Octokit> {
    if (this.config.authentication.type !== 'app' || !org)
      return this.authOctokit;
    if (!this.octokitByInstallationOrg.has(org)) {
      const {data: installation} =
        await this.authOctokit.apps.getOrgInstallation({org});
      if (installation.suspended_at) {
        throw new VError(
          `App installation for organization ${org} is suspended`
        );
      }
      const octokit = makeOctokitClient(
        this.config,
        installation.id,
        this.logger
      );
      this.octokitByInstallationOrg.set(org, octokit);
    }
    return this.octokitByInstallationOrg.get(org);
  }

  async checkConnection(): Promise<void> {
    if (this.config.authentication.type === 'token') {
      await this.authOctokit.users.getAuthenticated();
    } else if (this.config.authentication.type === 'app') {
      await this.authOctokit.apps.getAuthenticated();
    } else {
      throw new VError('Invalid authentication');
    }
  }

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<Organization>> {
    const orgs: Organization[] = [];
    for await (const org of this.getOrganizationsIterator()) {
      orgs.push(org);
    }
    return orgs;
  }

  async *getOrganizationsIterator(): AsyncGenerator<Organization> {
    if (this.config.authentication.type === 'token') {
      const iter = this.authOctokit.paginate.iterator(
        this.authOctokit.orgs.listForAuthenticatedUser,
        {
          per_page: PAGE_SIZE,
        }
      );
      for await (const res of iter) {
        for (const org of res.data) {
          yield pick(org, ['login']);
        }
      }
    } else if (this.config.authentication.type === 'app') {
      const iter = this.authOctokit.paginate.iterator(
        this.authOctokit.apps.listInstallations,
        {
          per_page: PAGE_SIZE,
        }
      );
      for await (const res of iter) {
        for (const installation of res.data) {
          if (installation.target_type !== 'Organization') continue;
          if (installation.suspended_at) continue;
          yield {
            login: installation.account.login,
          };
        }
      }
    }
  }

  async *getCopilotSeats(
    org: string,
    farosClient?: FarosClient,
    graph?: string
  ): AsyncGenerator<CopilotSeat> {
    const octokit = await this.octokit(org);
    const currentAssignees = new Set<string>();
    const iter = octokit.paginate.iterator(octokit.copilot.listCopilotSeats, {
      org,
      per_page: PAGE_SIZE,
    });
    try {
      for await (const res of iter) {
        for (const seat of res.data.seats) {
          currentAssignees.add(seat.assignee.login as string);
          yield {
            org,
            user: seat.assignee.login as string,
            inactive: false,
            ...pick(seat, [
              'created_at',
              'updated_at',
              'pending_cancellation_date',
              'last_activity_at',
            ]),
          };
        }
      }
    } catch (err: any) {
      // returns 404 if copilot business is not enabled for the org or if auth doesn't have required permissions
      // https://docs.github.com/en/rest/copilot/copilot-business?apiVersion=2022-11-28#get-copilot-business-seat-information-and-settings-for-an-organization
      if (err.status === 404) {
        this.logger.warn(
          `Failed to sync GitHub Copilot seats for org ${org}. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has the right permissions.`
        );
        return;
      }
      throw err;
    }
    if (!farosClient) {
      this.logger.warn(
        `Skipping inactive GitHub Copilot seats inference for org ${org}. Faros client not configured.`
      );
      return;
    }
    const previousAssigneesQuery = farosClient.nodeIterable(
      graph ?? DEFAULT_GRAPH,
      USER_TOOL_QUERY,
      100,
      paginatedQueryV2,
      new Map<string, any>([
        ['source', 'GitHub'],
        ['organizationUid', toLower(org)],
        ['toolCategory', GitHubTool.Copilot],
        ['inactive', false],
      ])
    );
    for await (const res of previousAssigneesQuery) {
      if (!currentAssignees.has(res.user.uid)) {
        yield {
          org,
          user: res.user.uid,
          inactive: true,
        };
      }
    }
  }

  async *getCopilotUsage(org: string): AsyncGenerator<CopilotUsageSummary> {
    try {
      const res = await this.octokit.copilot.usageMetricsForOrg({
        org,
      });
      if (isNil(res.data) || isEmpty(res.data)) {
        this.logger.warn(`No GitHub Copilot usage found for org ${org}.`);
        return;
      }
      for (const usage of res.data) {
        yield {
          org,
          ...usage,
        };
      }
    } catch (err: any) {
      // returns 404 if the organization does not have GitHub Copilot usage metrics enabled or if auth doesn't have required permissions
      // https://docs.github.com/en/enterprise-cloud@latest/early-access/copilot/copilot-usage-api
      if (err.status === 404) {
        this.logger.warn(
          `Failed to sync GitHub Copilot usage for org ${org}. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has the right permissions.`
        );
        return;
      }
      throw err;
    }
  }
}
