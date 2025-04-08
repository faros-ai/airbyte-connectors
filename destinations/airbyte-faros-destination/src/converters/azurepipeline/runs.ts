import {Run} from 'faros-airbyte-common/azure-devops';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurePipelineConverter} from './common';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {getOrganization} from '../common/azure-devops';
import {CategoryDetail} from '../common/common';
import {BuildStateCategory} from '../common/cicd';
import {Utils} from 'faros-js-client';

export class Runs extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];
  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const run = record.record.data as Run;
    const res: DestinationRecord[] = [];

    const organizationName = getOrganization(run.url, ctx);
    if (!organizationName) {
      ctx.logger.error(
        `No organization found for run ${run.id}. URL: ${run.url}`
      );
      return [];
    }

    const pipeline = {
      uid: String(run.pipeline?.id),
      organization: {uid: organizationName, source},
    };

    const runKey = {
      uid: String(run.id),
      pipeline,
    };

    const status = this.convertRunState(run.result);
    res.push({
      model: 'cicd_Build',
      record: {
        ...runKey,
        name: run.name,
        createdAt: Utils.toDate(run.createdDate),
        startedAt: Utils.toDate(run.createdDate),
        endedAt: Utils.toDate(run.finishedDate),
        status,
        url: run.url,
      },
    });
    return res;
  }

  // Read more on Azure pipeline run result:
  // https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/runs/list?view=azure-devops-rest-7.1#runresult

  private convertRunState(result: string | undefined): CategoryDetail {
    if (!result) {
      return;
    }
    switch (result) {
      case 'canceled':
        return {category: BuildStateCategory.Canceled, detail: result};
      case 'failed':
        return {category: BuildStateCategory.Failed, detail: result};
      case 'succeeded':
        return {category: BuildStateCategory.Success, detail: result};
      default:
        return {category: BuildStateCategory.Custom, detail: result};
    }
  }
}
