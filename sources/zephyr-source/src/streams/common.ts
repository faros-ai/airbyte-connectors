import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';

import {ZephyrConfig} from '../types';

export type StreamSlice = {
  project: Record<string, string>;
};

export type ProjectState = {
  readonly [project: string]: string;
};

export abstract class ZephyrStreamBase extends AirbyteStreamBase {
  // projects is an array of objects with key, versions, cycles,... properties
  protected readonly projects: ReadonlyArray<any>;
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
