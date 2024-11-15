import {SyncMode} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/lib/vanta';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Vanta} from '../vanta';
import {StreamBase, StreamState} from './common';

export class Vulnerabilities extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/vulnerabilities.json');
  }

  get cursorField(): string | string[] {
    return ['remediateByDate'];
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
    const latestRecordCutoff = Utils.toDate(latestRecord.remediateByDate);
    return this.getUpdatedStreamState(latestRecordCutoff, currentStreamState);
  }
}
