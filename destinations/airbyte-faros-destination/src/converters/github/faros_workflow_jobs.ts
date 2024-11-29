import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkflowJob} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosWorkflowJobs extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const workflowJob = record.record.data as WorkflowJob;

    const repository = GitHubCommon.repoKey(
      workflowJob.org,
      workflowJob.repo,
      this.streamName.source
    );
    const pipeline = {
      uid: workflowJob.workflow_id.toString(),
      organization: repository.organization,
    };
    const build = {
      uid: workflowJob.run_id.toString(),
      pipeline,
    };
    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: workflowJob.id.toString(),
          name: workflowJob.name,
          createdAt: workflowJob.created_at,
          startedAt: workflowJob.started_at,
          endedAt: workflowJob.completed_at,
          status: GitHubCommon.cicd_BuildStatus(
            workflowJob.status,
            workflowJob.conclusion
          ),
          url: workflowJob.url,
          build,
        },
      },
    ];
  }
}
