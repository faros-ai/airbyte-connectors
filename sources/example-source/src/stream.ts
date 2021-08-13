import {AirbyteStreamBase, StreamKey, SyncMode} from 'cdk';
import {Dictionary} from 'ts-essentials';

export class JenkinsBuilds extends AirbyteStreamBase {
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    yield {};
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../resources/schemas/builds.json');
  }
  get primaryKey(): StreamKey {
    return ['uid', 'source'];
  }
  get cursorField(): string {
    return 'updated_at';
  }
}
