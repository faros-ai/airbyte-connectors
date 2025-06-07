import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {LaunchDarkly} from '../launchdarkly';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly launchdarkly: LaunchDarkly,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/user.json');
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
    for await (const project of this.launchdarkly.getProjects()) {
      for await (const environment of this.launchdarkly.getEnvironments(
        project.key
      )) {
        yield* this.launchdarkly.getUsers(project.key, environment.key);
      }
    }
  }
}
