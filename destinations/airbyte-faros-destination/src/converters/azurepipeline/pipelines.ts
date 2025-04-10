import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Pipeline} from 'faros-airbyte-common/azure-devops';

import {getOrganizationFromUrl} from '../common/azure-devops';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';

export class Pipelines extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Pipeline',
  ];

  private readonly seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];

    const organizationName = getOrganizationFromUrl(pipeline.url);
    if (!organizationName) {
      ctx.logger.error(
        `No organization found for pipeline ${pipeline.id}. URL: ${pipeline.url}`
      );
      return [];
    }

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

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: String(pipeline.id),
        name: `${pipeline.project?.name}:${pipeline.name}`,
        url: pipeline.url,
        organization,
      },
    });

    return res;
  }
}
