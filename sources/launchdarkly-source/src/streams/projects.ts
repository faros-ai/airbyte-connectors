import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LaunchDarkly} from '../launchdarkly';

export class Projects extends AirbyteStreamBase {
  constructor(
    private readonly launchdarkly: LaunchDarkly,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/project.json');
  }

  get primaryKey(): StreamKey {
    return ['key'];
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[],
    _streamSlice?: Dictionary<any, string>,
    _streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    yield* this.launchdarkly.getProjects();
  }
}
