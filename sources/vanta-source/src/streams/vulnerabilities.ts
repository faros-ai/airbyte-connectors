import {SyncMode} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/vanta';
import {Dictionary} from 'ts-essentials';

import {Vanta} from '../vanta';
import {StreamBase, StreamState} from './common';

export class Vulnerabilities extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/vulnerabilities.json');
  }

  get cursorField(): string | string[] {
    return 'remediateByDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<Vulnerability> {
    const vanta = await Vanta.instance(this.cfg, this.logger);
    const remediatedAfter = this.getRemediatedAfter(streamState.cutoff);
    yield* vanta.getVulnerabilities(remediatedAfter);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Vulnerability
  ): StreamState {
    // Use the current date as the cutoff to ensure the next sync starts from this point onward.
    // This approach avoids gaps in syncs, as new vulnerabilities added after the last sync
    // (but with earlier SLA deadlines) are not missed.
    const latestRecordCutoff = new Date();
    return this.getUpdatedStreamState(latestRecordCutoff, currentStreamState);
  }
}
