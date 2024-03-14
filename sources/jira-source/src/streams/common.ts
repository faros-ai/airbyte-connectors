import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {Jira, JiraConfig} from '../jira';

export type StreamSlice = {
  project: string;
};

export type StreamState = {
  readonly [project: string]: ProjectState;
};

export interface ProjectState {
  readonly issueCutoff?: number;
}

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<StreamSlice> {
    if (!this.config.projectKeys) {
      const jira = await Jira.instance(this.config, this.logger);
      for await (const project of jira.getProjects()) {
        yield {project: project.key};
      }
    }
    for (const project of this.config.projectKeys) {
      yield {project};
    }
  }
}
