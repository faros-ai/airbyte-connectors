import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {GroupFilter} from '../group-filter';
import {GitLabConfig} from '../types';

export type GroupStreamSlice = {
  group: string;
};

export type StreamState = {
  readonly [groupKey: string]: {
    cutoff: number;
  };
};

export enum RunMode {
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

export const MinimumStreamNames = ['faros_groups'];

export const FullStreamNames = ['faros_groups', 'faros_projects'];

// fill as streams are developed
export const CustomStreamNames = ['faros_groups', 'faros_projects'];

export const RunModeStreams: {
  [key in RunMode]: string[];
} = {
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.Full]: FullStreamNames,
  [RunMode.Custom]: CustomStreamNames,
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly groupFilter: GroupFilter;
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.groupFilter = GroupFilter.instance(config, logger, farosClient);
  }

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    groupKey: string
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      groupKey
    );
  }

  static groupKey(group: string): string {
    return toLower(`${group}`);
  }
}

export abstract class StreamWithGroupSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<GroupStreamSlice> {
    for (const group of await this.groupFilter.getGroups()) {
      yield {group};
    }
  }
}
