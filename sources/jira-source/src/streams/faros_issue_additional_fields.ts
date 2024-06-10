import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {
  AdditionalFieldsStreamState,
  ProjectStreamSlice,
  StreamWithProjectSlices,
} from './common';

export class FarosIssueAdditionalFields extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssueAdditionalFields.json');
  }

  get primaryKey(): StreamKey | undefined {
    return ['key'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: AdditionalFieldsStreamState
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const updateRange = this.getUpdateRange();
    const issues = jira.getIssueCompactWithAdditionalFields(
      new JqlBuilder()
        .withProject(projectKey)
        .withDateRange(updateRange)
        .build()
    );
    for await (const issue of issues) {
      yield issue;
    }
  }

  getUpdatedState(
    currentStreamState: AdditionalFieldsStreamState,
    latestRecord: IssueCompact
  ): AdditionalFieldsStreamState {
    return {
      additionalFields: this.config.additional_fields,
    };
  }
}
