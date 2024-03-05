import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {CloudWatch, Config} from './cloudwatch';
import {Metrics} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CloudWatchMetricsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** CloudWatch Metrics source implementation. */
export class CloudWatchMetricsSource extends AirbyteSourceBase<Config> {
  get type(): string {
    return 'cloudwatch-metrics';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: Config): Promise<[boolean, VError]> {
    try {
      const cloudWatch = CloudWatch.instance(config);
      await cloudWatch.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: Config): AirbyteStreamBase[] {
    return [new Metrics(config, this.logger)];
  }
}
