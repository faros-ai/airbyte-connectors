import {Octokit} from '@octokit/rest';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {CopilotSeat} from 'faros-airbyte-common/github';
import {pick} from 'lodash';

import {makeOctokitClient} from './octokit';
import {GitHubConfig} from './types';

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

  async *getCopilotSeats(org: string): AsyncGenerator<CopilotSeat> {
    const iter = this.octokit.paginate.iterator(
      this.octokit.copilot.listCopilotSeats,
      {
        org,
        per_page: PAGE_SIZE,
      }
    );
    for await (const res of iter) {
      for (const seat of res.data.seats) {
        yield {
          org,
          user: seat.assignee.login as string,
          ...pick(seat, [
            'created_at',
            'updated_at',
            'pending_cancellation_date',
            'last_activity_at',
          ]),
        };
      }
    }
  }
}
