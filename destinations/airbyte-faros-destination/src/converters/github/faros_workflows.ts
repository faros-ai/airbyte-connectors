import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Workflow} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {Workflows as CommunityWorkflows} from './workflows';

export class FarosWorkflows extends GitHubConverter {
  private readonly alias = new CommunityWorkflows();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const workflow = record.record.data as Workflow;
    record.record.data = {
      ...workflow,
      repository: `${workflow.org}/${workflow.repo}`,
    };
    return this.alias.convert(record);
  }
}
