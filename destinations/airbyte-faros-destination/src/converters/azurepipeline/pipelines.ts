import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';
import {Pipeline} from './models';

export class Pipelines extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Deployment',
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  private seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];
    const organizationName = this.getOrganizationFromUrl(pipeline.url);
    const organization = {uid: organizationName, source};

    if (!this.seenOrganizations.has(organizationName)) {
      this.seenOrganizations.add(organizationName);
      res.push({
        model: 'cicd_Organization',
        record: {
          uid: organizationName,
          name: organizationName,
          source,
        },
      });
    }

    for (const runItem of pipeline.runs) {
      const applicationMapping = this.applicationMapping(ctx);
      const application =
        (applicationMapping && applicationMapping[runItem.name]) ?? null;
      const startedAt = Utils.toDate(runItem.createdDate);
      const endedAt = Utils.toDate(runItem.finishedDate);
      const status = this.convertDeploymentStatus(runItem.result);
      res.push({
        model: 'cicd_Deployment',
        record: {
          uid: String(runItem.id),
          application,
          build: {
            uid: String(runItem.id),
            pipeline: {uid: String(pipeline.id), organization},
          },
          startedAt,
          endedAt,
          status,
          source,
        },
      });
    }

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: String(pipeline.id),
        name: pipeline.name,
        url: pipeline.url,
        organization,
      },
    });
    return res;
  }
}
