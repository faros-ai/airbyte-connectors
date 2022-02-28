import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {DataDog} from '../datadog';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly dataDog: DataDog,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incident.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }
  get cursorField(): string | string[] {
    return ['attributes', 'modified'];
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    _streamState?: Dictionary<any, any>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    yield* this.dataDog.getUsers();
  }
}
