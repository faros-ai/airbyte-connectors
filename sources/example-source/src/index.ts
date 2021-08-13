import {
  AirbyteAbstractSource,
  AirbyteCatalogMessage,
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusValue,
  AirbyteLogger,
  AirbyteMessage,
  AirbyteRecord,
  AirbyteSource,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStateMessage,
  AirbyteStreamBase,
} from 'cdk';
import {Command} from 'commander';
import {Dictionary} from 'ts-essentials';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ExampleSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

interface StreamState {
  cutoff: number;
}

class ExampleSource2 extends AirbyteAbstractSource {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, any]> {
    if (config.user === 'chris') {
      return [true, undefined];
    }
    return [false, 'User is not chris'];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    throw new Error('Method not implemented.');
  }
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
    const status =
      config.user === 'chris'
        ? AirbyteConnectionStatusValue.SUCCEEDED
        : AirbyteConnectionStatusValue.FAILED;
    return new AirbyteConnectionStatus({status});
  }
  async discover(config: AirbyteConfig): Promise<AirbyteCatalogMessage> {
    return new AirbyteCatalogMessage(require('../resources/catalog.json'));
  }
  async *read(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    this.logger.info('Syncing stream: jenkins_builds');

    const lastCutoff = (state?.jenkins_builds as StreamState)?.cutoff ?? 0;
    if (lastCutoff > Date.now()) {
      this.logger.info(
        `Last cutoff ${lastCutoff} is greater than current time`
      );
      yield new AirbyteStateMessage({data: state});
      return;
    }

    // Process each stream in the configured catalog
    // In this example, there's only one stream so we assume it's enabled
    const numBuilds = 5;
    for (let i = 1; i <= numBuilds; i++) {
      yield AirbyteRecord.make(
        'jenkins_builds',
        this.newBuild(i, lastCutoff),
        'faros'
      );
    }
    this.logger.info(`Synced ${numBuilds} records from stream jenkins_builds`);

    // Write state for next sync
    yield new AirbyteStateMessage({
      data: {jenkins_builds: {cutoff: Date.now()}},
    });
  }

  private newBuild(uid: number, cutoff: number): Dictionary<any> {
    return {
      uid: uid.toString(),
      source: 'Jenkins',
      updated_at: cutoff + uid,
      fields: {
        command: `command ${uid}`,
      },
      additional_fields: [
        {
          name: `key${uid}`,
          value: `value${uid}`,
          nested: {
            value: `nested ${uid}`,
          },
        },
      ],
    };
  }
}
