import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {SourceConfig} from '../config';

export class Builds extends AirbyteStreamBase {
  constructor(
    private readonly config: SourceConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return ['uid', 'source'];
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    // Check incremental state to determine where to start reading records
    const lastCutoff: number = streamState?.cutoff ?? 0;
    if (lastCutoff > Date.now()) {
      this.logger.info(
        `Last cutoff ${lastCutoff} is greater than current time`
      );
      return;
    }

    // Read the source config
    this.logger.info(`User from config is ${this.config.user}`);

    // Generate records
    const numBuilds = 5;
    for (let i = 1; i <= numBuilds; i++) {
      yield this.newBuild(i, lastCutoff);
    }
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    return {
      cutoff: Math.max(
        currentStreamState.cutoff ?? 0,
        latestRecord.updated_at ?? 0
      ),
    };
  }

  private newBuild(uid: number, cutoff: number): Dictionary<any> {
    return {
      uid: uid.toString(),
      source: 'Jenkins',
      updated_at: cutoff + uid,
      fields: {
        command: `command ${uid}`,
      },
      more_fields: [
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
