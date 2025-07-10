import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {TeamMembershipHistory} from './streams';
import {FarosClient} from 'faros-js-client';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new TeamHistorySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

interface TeamHistorySourceConfig {
  readonly api_url: string;
  readonly api_key: string;
  readonly graph: string;
}

export class TeamHistorySource extends AirbyteSourceBase<TeamHistorySourceConfig> {
  get type(): string {
    return 'team-history';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(
    cfg: TeamHistorySourceConfig
  ): Promise<[boolean, VError]> {
    try {
      const faros = this.makeFarosClient(cfg);
      if (!(await faros.graphExists(cfg.graph))) {
        return [false, new VError(`Graph ${cfg.graph} does not exist!`)];
      }
    } catch (err: any) {
      return [false, err as VError];
    }
    return [true, undefined];
  }

  streams(cfg: TeamHistorySourceConfig): AirbyteStreamBase[] {
    const faros = this.makeFarosClient(cfg);
    return [new TeamMembershipHistory(faros, cfg.graph, this.logger)];
  }

  private makeFarosClient(cfg: TeamHistorySourceConfig): FarosClient {
    if (!cfg.api_key) throw new VError('Faros API key was not provided');
    if (!cfg.graph) throw new VError('Faros graph name was not provided');
    return new FarosClient({
      url: cfg.api_url,
      apiKey: cfg.api_key,
    });
  }
}
