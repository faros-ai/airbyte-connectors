import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Cases, Results, Runs, Suites} from './streams';
import {TestRails, TestRailsConfig} from './testrails/testrails';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new TestRailsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** TestRails source implementation. */
export class TestRailsSource extends AirbyteSourceBase<TestRailsConfig> {
  get type(): string {
    return 'testrails';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: TestRailsConfig): Promise<[boolean, VError]> {
    const testRails = await TestRails.instance(config, this.logger);
    try {
      await testRails.checkConnection();
      return [true, undefined];
    } catch (err: any) {
      return [false, new VError(err, 'Connection check failed.')];
    }
  }
  streams(config: TestRailsConfig): AirbyteStreamBase[] {
    return [
      new Suites(config, this.logger),
      new Cases(config, this.logger),
      new Runs(config, this.logger),
      new Results(config, this.logger),
    ];
  }
}
