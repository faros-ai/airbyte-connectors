import {AirbyteLogger, SyncMode} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/vanta';
import {Dictionary} from 'ts-essentials';

import {VantaConfig} from '../index';
import {Vanta} from '../vanta';
import {StreamBase, StreamState} from './common';

export class Vulnerabilities extends StreamBase {
  private readonly syncStartDate: Date;

  constructor(
    protected readonly cfg: VantaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(cfg, logger);
    // Save the current date when the stream is instantiated to use as the cutoff for the next sync
    this.syncStartDate = new Date();
  }

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
    // Use the syncStartDate (saved in the constructor) as the cutoff for the next sync
    // This approach avoids gaps in syncs, as new vulnerabilities added after the last sync
    // (but with earlier SLA deadlines) are not missed.
    return this.getUpdatedStreamState(this.syncStartDate, currentStreamState);
  }
}
