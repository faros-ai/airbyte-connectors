import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {HarnessNextgenConverter, HarnessNextgenPipeline} from './common';

export class Pipelines extends HarnessNextgenConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  private seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pipeline = record.record.data as HarnessNextgenPipeline;
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];

    const orgUid = pipeline.orgIdentifier;
    const pipelineUid = `${orgUid}/${pipeline.projectIdentifier}/${pipeline.identifier}`;

    if (!this.seenOrganizations.has(orgUid)) {
      res.push({
        model: 'cicd_Organization',
        record: {
          uid: orgUid,
          source,
        },
      });
      this.seenOrganizations.add(orgUid);
    }

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: pipelineUid,
        name: pipeline.name,
        description: pipeline.description,
        organization: {uid: orgUid, source},
      },
    });

    return res;
  }
}
