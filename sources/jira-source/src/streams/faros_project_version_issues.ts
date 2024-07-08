import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueProjectVersion} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_CUTOFF_LAG_DAYS, Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {StreamState, StreamWithProjectSlices} from './common';

export class FarosProjectVersionIssues extends StreamWithProjectSlices {
  get dependencies(): ReadonlyArray<string> {
    return ['faros_project_versions'];
  }

  // Not really an incremental stream, but want to read state to get the start date
  get supportsIncremental(): boolean {
    return true;
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjectVersionIssues.json');
  }

  get primaryKey(): StreamKey {
    return ['key'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: StreamState
  ): AsyncGenerator<IssueProjectVersion> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;

    const projectState = streamState?.[projectKey];
    const from = this.getUpdateRange(projectState?.cutoff)[0];
    for (const version of await jira.getProjectVersions(projectKey)) {
      const releaseJQL = new JqlBuilder(
        `updated >= ${from.getTime()} and fixVersion = ${version.id}`
      ).build();
      for await (const issue of jira.getIssuesKeys(releaseJQL)) {
        yield {
          key: issue,
          projectKey,
          projectVersionId: version.id,
        };
      }
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: IssueProjectVersion
  ): StreamState {
    const currentCutoff = Utils.toDate(
      currentStreamState?.[latestRecord.projectKey]?.cutoff
    );
    if (!currentCutoff) {
      return {
        ...currentStreamState,
        [latestRecord.projectKey]: {
          cutoff: this.config.startDate.getTime(),
        },
      };
    }

    const adjustedLatestRecordCutoff = DateTime.fromJSDate(currentCutoff)
      .minus({days: this.config.cutoff_lag_days ?? DEFAULT_CUTOFF_LAG_DAYS})
      .toJSDate();

    if (adjustedLatestRecordCutoff < currentCutoff) {
      const newState = {
        cutoff: adjustedLatestRecordCutoff.getTime(),
      };
      return {
        ...currentStreamState,
        [latestRecord.projectKey]: newState,
      };
    }

    return currentStreamState;
  }
}
