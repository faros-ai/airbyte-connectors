import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteLogger,
  AirbyteMessage,
  AirbyteRecord,
  AirbyteSource,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  ConfiguredAirbyteCatalog,
} from 'cdk';
import {Command} from 'commander';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ExampleSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
class ExampleSource extends AirbyteSource {
  constructor(private readonly logger: AirbyteLogger) {
    super();
  }
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';
    return new AirbyteConnectionStatus({status});
  }
  async discover(): Promise<AirbyteCatalog> {
    return new AirbyteCatalog(require('../resources/catalog.json'));
  }
  async *read(
    config: AirbyteConfig,
    catalog: ConfiguredAirbyteCatalog,
    state?: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    this.logger.info('Syncing stream: jenkins_builds');

    const numBuilds = 5;
    for (let i = 0; i < numBuilds; i++) {
      yield AirbyteRecord.make('jenkins_builds', 'faros', this.newBuild(i));
    }
    this.logger.info(`Synced ${numBuilds} records from stream jenkins_builds`);

    // Write state for next sync
    yield new AirbyteState({data: {cutoff: Date.now()}});
  }
  private newBuild(idx: number): any {
    return {
      uid: 'uid' + idx,
      source: 'Jenkins',
      fields: {
        command: 'command ' + idx,
        number: Date.now(),
      },
      additional_fields: [
        {
          name: 'key' + idx,
          value: Date.now(),
          nested: {
            value: 'nested' + idx,
          },
        },
        {
          name: 'static',
          value: 'static',
          nested: {
            value: 'static',
          },
        },
      ],
    };
  }
}
