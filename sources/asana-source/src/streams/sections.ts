import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig} from '../asana';
import {Section} from '../models';

type StreamSlice = {
  project: string;
};

export class Sections extends AirbyteStreamBase {
  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/sections.json');
  }

  get primaryKey(): StreamKey {
    return 'gid';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const asana = Asana.instance(this.config);

    for (const workspace of await asana.getWorkspaces()) {
      for await (const project of asana.getProjects(
        workspace.gid,
        this.logger
      )) {
        yield {project: project.gid};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Section> {
    const asana = Asana.instance(this.config);

    yield* asana.getSections(streamSlice.project, this.logger);
  }
}
