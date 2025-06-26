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
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];

    const organizationName = this.getOrganizationFromSourceConfig(ctx) ??
      getOrganizationFromUrl(pipeline.url);

    if (!organizationName) {
      ctx.logger.error(
        `No organization found for pipeline ${pipeline.id}. URL: ${pipeline.url} and no organization configured in the source config`
      );
      return [];
    }

    const orgKey = this.getOrgKey(organizationName);

    if (!this.seenOrganizations.has(orgKey.uid)) {
      this.seenOrganizations.add(orgKey.uid);
      res.push({
        model: 'cicd_Organization',
        record: {
          ...orgKey,
          name: organizationName,
        },
      });
    }

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: String(pipeline.id),
        name: `${pipeline.project?.name}:${pipeline.name}`,
        url: pipeline.url,
        description: pipeline.folder,
        organization: orgKey,
      },
    });

    return res;
  }
}
