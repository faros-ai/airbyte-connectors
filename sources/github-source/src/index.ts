import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {GitHub} from './github';
import {FarosCopilotSeats} from './streams/faros_copilot_seats';
import {FarosCopilotUsage} from './streams/faros_copilot_usage';
import {FarosOrganizations} from './streams/faros_organizations';
import {FarosTeamMemberships} from './streams/faros_team_memberships';
import {FarosTeams} from './streams/faros_teams';
import {GitHubConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitHubSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitHubSource extends AirbyteSourceBase<GitHubConfig> {
  get type(): string {
    return 'github';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitHubConfig): Promise<[boolean, VError]> {
    try {
      await GitHub.instance(config, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: GitHubConfig): AirbyteStreamBase[] {
    return [
      new FarosCopilotSeats(config, this.logger),
      new FarosCopilotUsage(config, this.logger),
      new FarosOrganizations(config, this.logger),
      new FarosTeams(config, this.logger),
      new FarosTeamMemberships(config, this.logger),
    ];
  }
}
