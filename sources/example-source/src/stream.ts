import {Dictionary} from 'ts-essentials';
import {AirbyteStreamBase, StreamKey, SyncMode} from 'cdk';

class JenkinsBuilds extends AirbyteStreamBase {
  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    throw new Error('Method not implemented.');
  }
  getJsonSchema(): Dictionary<any, string> {
    throw new Error('Method not implemented.');
  }
  get primaryKey(): StreamKey {
    throw new Error('Method not implemented.');
  }
}
