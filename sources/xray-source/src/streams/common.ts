import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
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

  protected getModifiedSince(syncMode: SyncMode, since?: string): string {
    if (since && syncMode === SyncMode.INCREMENTAL) {
      return XrayStreamBase.formatModifiedSince(since);
    }

    return XrayStreamBase.formatModifiedSince(
      DateTime.now()
        .toUTC()
        .minus({days: this.config.cutoff_days ?? DEFAULT_CUTOFF_DAYS})
    );
  }

  // modifiedSince date format should be YYYY-MM-DDTHH:mm:ssZ
  protected static formatModifiedSince(date: string | DateTime): string {
    const dateTime = typeof date === 'string' ? DateTime.fromISO(date) : date;
    return dateTime.startOf('second').toISO({suppressMilliseconds: true});
  }
}

export abstract class XrayProjectStream extends XrayStreamBase {
  protected lastModifiedByProject: Map<string, DateTime> = new Map<
    string,
    DateTime
  >();

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.projects ?? []) {
      yield {project};
    }
  }

  updateLatestModified(project: string, lastModified: string): void {
    const current = this.lastModifiedByProject.get(project);
    const lastModifiedDate = DateTime.fromISO(lastModified);
    if (!current || lastModifiedDate > current) {
      this.lastModifiedByProject.set(project, lastModifiedDate);
    }
  }
}
