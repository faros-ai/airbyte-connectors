import {Octokit} from '@octokit/rest';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  AppInstallation,
  CopilotSeat,
  CopilotUsageSummary,
  GitHubTool,
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

export abstract class GitHub {
  private static github: GitHub;

  constructor(
    protected readonly config: GitHubConfig,
    protected readonly baseOctokit: Octokit,
    protected readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    if (GitHub.github) {
      return GitHub.github;
    }
    const github =
      cfg.authentication.type === 'token'
        ? await TokenGitHub.instance(cfg, logger)
        : await AppGitHub.instance(cfg, logger);
    GitHub.github = github;
    return github;
  }

  abstract checkConnection(): Promise<void>;

  abstract octokit(org: string): Octokit;

  abstract getOrganizationsIterator(): AsyncGenerator<string>;

  @Memoize()
  async getOrganizations(): Promise<ReadonlyArray<string>> {
    const orgs: string[] = [];
    for await (const org of this.getOrganizationsIterator()) {
      orgs.push(org);
    }
    return orgs;
  }

  async *getCopilotSeats(
    org: string,
    farosClient?: FarosClient,
    graph?: string
  ): AsyncGenerator<CopilotSeat> {
    const currentAssignees = new Set<string>();
    const iter = this.octokit(org).paginate.iterator(
      this.baseOctokit.copilot.listCopilotSeats,
      {
        org,
        per_page: PAGE_SIZE,
      }
    );
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
      const res = await this.octokit(org).copilot.usageMetricsForOrg({
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

export class TokenGitHub extends GitHub {
  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    const baseOctokit = makeOctokitClient(cfg, undefined, logger);
    const github = new TokenGitHub(cfg, baseOctokit, logger);
    await github.checkConnection();
    return github;
  }

  octokit(org: string): Octokit {
    return this.baseOctokit;
  }

  async checkConnection(): Promise<void> {
    await this.baseOctokit.users.getAuthenticated();
  }

  async *getOrganizationsIterator(): AsyncGenerator<string> {
    const iter = this.baseOctokit.paginate.iterator(
      this.baseOctokit.orgs.listForAuthenticatedUser,
      {
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const org of res.data) {
        yield org.login;
      }
    }
  }
}

export class AppGitHub extends GitHub {
  private readonly octokitByInstallationOrg: Map<string, Octokit> = new Map();

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    const baseOctokit = makeOctokitClient(cfg, undefined, logger);
    const github = new AppGitHub(cfg, baseOctokit, logger);
    await github.checkConnection();
    const installations = await github.getAppInstallations();
    for (const installation of installations) {
      if (installation.target_type !== 'Organization') continue;
      if (installation.suspended_at) {
        logger.warn(
          `Skipping suspended app installation for org ${installation.account.login}`
        );
        continue;
      }
      const octokit = makeOctokitClient(cfg, installation.id, logger);
      github.octokitByInstallationOrg.set(installation.account.login, octokit);
    }
    return github;
  }

  octokit(org: string): Octokit {
    if (!this.octokitByInstallationOrg.has(org)) {
      throw new VError(`No active app installation found for org ${org}`);
    }
    return this.octokitByInstallationOrg.get(org);
  }

  async checkConnection(): Promise<void> {
    await this.baseOctokit.apps.getAuthenticated();
  }

  async *getOrganizationsIterator(): AsyncGenerator<string> {
    for (const org of this.octokitByInstallationOrg.keys()) {
      yield org;
    }
  }

  @Memoize()
  private async getAppInstallations(): Promise<ReadonlyArray<AppInstallation>> {
    const installations: AppInstallation[] = [];
    const iter = this.baseOctokit.paginate.iterator(
      this.baseOctokit.apps.listInstallations,
      {
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const installation of res.data) {
        installations.push(installation);
      }
    }
    return installations;
  }
}
