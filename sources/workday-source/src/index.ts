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

import {CustomReports, OrgCharts, Orgs, People, Workers} from './streams';
import {Workday} from './workday';

export interface WorkdayConfig extends AirbyteConfig {
  readonly tenant: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly baseUrl: string;
  readonly limit?: number;
  readonly customReportName?: string;
  readonly timeout?: number;
  readonly username?: string;
  readonly password?: string;
}

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new WorkdaySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Workday source implementation. */
export class WorkdaySource extends AirbyteSourceBase<WorkdayConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: WorkdayConfig): Promise<[boolean, VError]> {
    try {
      const workday = await Workday.instance(config, this.logger);
      await workday.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: WorkdayConfig): AirbyteStreamBase[] {
    return [
      new OrgCharts(config, this.logger),
      new Orgs(config, this.logger),
      new People(config, this.logger),
      new Workers(config, this.logger),
      new CustomReports(config, this.logger),
    ];
  }
}
