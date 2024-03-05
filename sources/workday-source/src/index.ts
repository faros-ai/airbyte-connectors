import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Customreports, OrgCharts, Orgs, People, Workers} from './streams';
import {Workday} from './workday';

export interface TokenCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}
export interface UsernamePasswordCredentials {
  readonly username: string;
  readonly password: string;
}

export interface WorkdayConfig extends AirbyteConfig {
  readonly tenant: string;
  readonly baseUrl: string;
  readonly credentials: TokenCredentials | UsernamePasswordCredentials;
  readonly skipConnectionCheck?: boolean;
  readonly limit?: number;
  readonly customReportName?: string;
  readonly timeout?: number;
}

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new WorkdaySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Workday source implementation. */
export class WorkdaySource extends AirbyteSourceBase<WorkdayConfig> {
  get type(): string {
    return 'workday';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: WorkdayConfig): Promise<[boolean, VError]> {
    if (config.skipConnectionCheck) {
      return [true, undefined];
    }
    try {
      const workday = await Workday.instance(config, this.logger);
      await workday.checkConnection();
    } catch (err: any) {
      return [false, new VError(err, 'Connection check failed.')];
    }
    return [true, undefined];
  }
  streams(config: WorkdayConfig): AirbyteStreamBase[] {
    return [
      new OrgCharts(config, this.logger),
      new Orgs(config, this.logger),
      new People(config, this.logger),
      new Workers(config, this.logger),
      new Customreports(config, this.logger),
    ];
  }
}
