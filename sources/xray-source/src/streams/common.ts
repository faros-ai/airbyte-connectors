import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {XrayConfig} from '../types';

const DEFAULT_CUTOFF_DAYS = 90;

export type StreamSlice = {
  project: string;
};

export type ProjectState = {
  readonly [project: string]: string;
};

export abstract class XrayStreamBase extends AirbyteStreamBase {
  protected readonly projects: ReadonlyArray<string>;
  constructor(
    protected readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.projects = config.projects;
  }

  // Most of the streams will have the same primary key
  get primaryKey(): StreamKey {
    return ['issueId'];
  }

  protected getModifiedSince(syncMode: SyncMode, cutoff?: string): string {
    if (cutoff && syncMode === SyncMode.INCREMENTAL) {
      return cutoff;
    }
    return DateTime.now()
      .toUTC()
      .minus({days: this.config.cutoff_days ?? DEFAULT_CUTOFF_DAYS})
      .startOf('day')
      .toISO({suppressMilliseconds: true});
  }
}

export abstract class XrayProjectStream extends XrayStreamBase {
  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.projects ?? []) {
      yield {project};
    }
  }
}
