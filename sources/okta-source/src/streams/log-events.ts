import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Okta, OktaConfig} from '../okta';

export class LogEvents extends AirbyteStreamBase {
  constructor(
    private readonly config: OktaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/log-events.json');
  }
  get primaryKey(): StreamKey {
    return ['uid', 'source'];
  }
  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const okta = await Okta.instance(this.config, this.logger);
    yield* okta.getLogs();
  }
}
