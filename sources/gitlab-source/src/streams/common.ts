import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';

export enum CustomStreamNames {
  FarosGroups = 'faros_groups',
}

export interface GroupStreamSlice {
  group: string;
}

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
}

export abstract class StreamWithGroupSlices extends StreamBase {
  
  async *streamSlices(): AsyncGenerator<GroupStreamSlice> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const groups = await gitlab.getAllGroups();
    
    for (const group of groups) {
      yield {group: group.path};
    }
  }
}
