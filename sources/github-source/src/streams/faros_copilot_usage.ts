import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {CopilotUsageSummary} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosCopilotUsage extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCopilotUsage.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'day'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<CopilotUsageSummary> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    yield* github.getCopilotUsage(org);
  }
}
