import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkflowRun} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {WorkflowRuns as CommunityWorkflowRuns} from './workflow_runs';

export class FarosWorkflowRuns extends GitHubConverter {
  private readonly alias = new CommunityWorkflowRuns();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const workflowRun = record.record.data as WorkflowRun;
    record.record.data = {
      ...workflowRun,
      repository: {
        full_name: `${workflowRun.org}/${workflowRun.repo}`,
      },
      head_commit: {
        id: workflowRun.head_sha,
      },
    };
    return this.alias.convert(record);
  }
}
