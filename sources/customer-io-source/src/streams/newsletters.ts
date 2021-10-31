import {AxiosInstance} from 'axios';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {genAuthorizationHeader} from '../gen-authorization-header';

export class Newsletters extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly axios: AxiosInstance,
    private readonly config: AirbyteConfig
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/newsletters.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  get cursorField(): string {
    return 'updated';
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>
  ): Dictionary<any> {
    return {
      cutoff: Math.max(
        currentStreamState.cutoff ?? 0,
        latestRecord.updated ?? 0
      ),
    };
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const lastCutoff: number = streamState?.cutoff ?? 0;
    if (lastCutoff > Date.now() / 1000) {
      this.logger.info(
        `Last cutoff ${lastCutoff} is greater than current time`
      );
      return;
    }

    const response = await this.axios.get('/newsletters', {
      headers: genAuthorizationHeader(this.config),
    });

    for (const newsletter of response.data.newsletters) {
      yield newsletter;
    }
  }
}
