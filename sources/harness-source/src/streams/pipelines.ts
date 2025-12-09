import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Harness} from '../harness';
import {Pipeline} from '../harness_models';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Pipelines extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): StreamKey {
    return ['orgIdentifier', 'projectIdentifier', 'identifier'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<Pipeline> {
    const {orgIdentifier, projectIdentifier} = streamSlice;
    const harness = Harness.instance(this.config, this.logger);
    for (const pipeline of await harness.getPipelines(orgIdentifier, projectIdentifier)) {
      yield {...pipeline, orgIdentifier, projectIdentifier};
    }
  }
}
