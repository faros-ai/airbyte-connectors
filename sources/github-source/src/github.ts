import {Octokit} from '@octokit/rest';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  GitHubTool,
  Organization,
} from 'faros-airbyte-common/github';
import {FarosClient, paginatedQueryV2} from 'faros-js-client';
import fs from 'fs';
import {pick, toLower} from 'lodash';
import path from 'path';
import {Memoize} from 'typescript-memoize';

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
  private static github: GitHub;

  constructor(
    private readonly octokit: Octokit,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: GitHubConfig,
    logger: AirbyteLogger
  ): Promise<GitHub> {
    if (GitHub.github) return GitHub.github;

    const octokit = makeOctokitClient(cfg, logger);

    GitHub.github = new GitHub(octokit, logger);
    return GitHub.github;
  }

  async checkConnection(): Promise<void> {
    await this.octokit.users.getAuthenticated();
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
    const iter = this.octokit.paginate.iterator(this.octokit.orgs.list, {
      per_page: PAGE_SIZE,
    });
    for await (const res of iter) {
      for (const org of res.data) {
        yield pick(org, ['login']);
      }
    }
  }

  async *getCopilotSeats(
    org: string,
    farosClient?: FarosClient,
    graph?: string
  ): AsyncGenerator<CopilotSeat> {
    const currentAssignees = new Set<string>();
    const iter = this.octokit.paginate.iterator(
      this.octokit.copilot.listCopilotSeats,
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
          'Failed to sync GitHub Copilot seats for org %s. Ensure GitHub Copilot is enabled for the organization and/or the authentication token/app has manage_billing:copilot permissions',
          org
        );
        return;
      }
      this.logger.error(
        `Failed to sync GitHub Copilot seats for org ${org}.`,
        err.stack
      );
    }
    if (!farosClient) {
      this.logger.warn(
        'Skipping inactive Copilot seats inference for org %s. Faros client not configured.',
        org
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
}
