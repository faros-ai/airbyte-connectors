import {
  AirbyteCatalog,
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
} from 'cdk';
import {Command} from 'commander';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ExampleSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

interface StreamState {
  cutoff: number;
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
  async discover(): Promise<AirbyteCatalog> {
    return new AirbyteCatalog(require('../resources/catalog.json'));
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

    const numBuilds = 5;
    for (let i = 1; i <= numBuilds; i++) {
      yield AirbyteRecord.make(
        'jenkins_builds',
        'faros',
        this.newBuild(i, lastCutoff)
      );
    }
    this.logger.info(`Synced ${numBuilds} records from stream jenkins_builds`);

    // Write state for next sync
    yield new AirbyteStateMessage({
      data: {jenkins_builds: {cutoff: Date.now()}},
    });
  }

  private newBuild(uid: number, cutoff: number): any {
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
