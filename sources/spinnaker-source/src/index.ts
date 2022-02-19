import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Spinnaker, SpinnakerConfig} from './spinnaker';
import {Applications, Builds, Executions, Jobs, Pipelines} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new SpinnakerSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Spinnaker source implementation. */
export class SpinnakerSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: SpinnakerConfig): Promise<[boolean, VError]> {
    try {
      const spinnaker = Spinnaker.instance(config, this.logger);
      await spinnaker.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: SpinnakerConfig): AirbyteStreamBase[] {
    return [
      new Applications(config, this.logger),
      new Builds(config, config.buildMasters, this.logger),
      new Executions(config, config.pipelineConfigIds, this.logger),
      new Jobs(config, config.buildMasters, this.logger),
      new Pipelines(config, config.applications, this.logger),
    ];
  }
}
