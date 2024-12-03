import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Enterprise} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {EnterpriseStreamSlice, StreamWithEnterpriseSlices} from './common';

export class FarosEnterprises extends StreamWithEnterpriseSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEnterprises.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'slug';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: EnterpriseStreamSlice
  ): AsyncGenerator<Enterprise> {
    const enterprise = streamSlice?.enterprise;
    const github = await GitHub.instance(this.config, this.logger);
    yield github.getEnterprise(enterprise);
  }
}
