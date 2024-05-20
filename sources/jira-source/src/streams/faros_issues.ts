import {AirbyteSourceLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Issue} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {omit} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {
  ProjectStreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';
const logger = new AirbyteSourceLogger();
export class FarosIssues extends StreamWithProjectSlices {
  projectKey: string;

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssues.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'key';
  }

  get cursorField(): string | string[] {
    return ['updated'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    try {
      const jira = await Jira.instance(this.config, this.logger);
      this.projectKey = streamSlice?.project;
      const updateRange =
        syncMode === SyncMode.INCREMENTAL
          ? this.getUpdateRange(streamState?.[this.projectKey]?.cutoff)
          : undefined;
      for await (const issue of jira.getIssues(this.projectKey, updateRange)) {
        logger.info('Issue Record received from source');
        logger.info('Processing record:', JSON.stringify(issue));
        yield omit(issue, 'fields');
      }
    } catch (err: any) {
      logger?.warn(
        `Failed to get issue :${err},stream slice : ${streamSlice}},project_key:${this.projectKey}`
      );
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      this.projectKey
    );
  }
}
