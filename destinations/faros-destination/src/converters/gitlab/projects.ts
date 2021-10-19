import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class GitlabProjects extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'vcs_Repository',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(project.web_url, source);

    if (!repository) return [];

    res.push({
      model: 'cicd_Pipeline',
      record: {
        uid: project.path?.toLowerCase(),
        name: project.name,
        description: project.description?.substring(
          0,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        url: project.web_url,
        organization: repository.organization,
      },
    });

    res.push({
      model: 'vcs_Repository',
      record: {
        name: project.path?.toLowerCase(),
        fullName: project.name_with_namespace,
        private: project.visibility === 'private',
        description: project.description?.substring(
          0,
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
