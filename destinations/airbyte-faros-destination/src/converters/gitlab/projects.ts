import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Projects extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(project.web_url, source);

    if (!repository) return [];

    // Create a TMS Project/Board per repo that we sync
    res.push(
      ...GitlabCommon.tms_ProjectBoard_with_TaskBoard(
        repository,
        project.body,
        project.created_at,
        project.updated_at
      )
    );
    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: repository.uid,
        name: repository.name,
        description: Utils.cleanAndTruncate(
          project.description,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        url: project.web_url,
        organization: repository.organization,
      },
    });

    res.push({
      model: 'vcs_Repository',
      record: {
        name: repository.name,
        uid: repository.uid,
        fullName: project.name_with_namespace,
        private: project.visibility === 'private',
        description: Utils.cleanAndTruncate(
          project.description,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        size: Utils.parseInteger(project.statistics.repository_size),
        mainBranch: project.default_branch,
        htmlUrl: project.web_url,
        createdAt: Utils.toDate(project.created_at),
        updatedAt: Utils.toDate(project.updated_at),
        organization: repository.organization,
      },
    });

    return res;
  }
}
