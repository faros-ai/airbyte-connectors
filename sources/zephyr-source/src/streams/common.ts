import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import {ZephyrConfig} from '../types';

export type StreamSlice = {
  project: string;
};

export type ProjectState = {
  readonly [project: string]: string;
};

export abstract class ZephyrStreamBase extends AirbyteStreamBase {
  protected readonly projects: ReadonlyArray<string>;
  constructor(
    protected readonly config: ZephyrConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.projects = config.projects;
  }

  // Most of the streams will have the same primary key
  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.projects ?? []) {
      yield {project};
    }
  }
}
