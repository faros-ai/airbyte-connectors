import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabConverter} from './common';

export class FarosProjects extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as Project;
    const organization = {
      uid: project.group_id,
      source: this.streamName.source,
    };

    const res: DestinationRecord[] = [
      {
        model: 'vcs_Repository',
        record: {
          name: project.id,
          uid: project.id,
          fullName: project.path_with_namespace,
          private: project.visibility === 'private',
          description: Utils.cleanAndTruncate(project.description),
          mainBranch: project.default_branch,
          htmlUrl: project.web_url,
          createdAt: Utils.toDate(project.created_at),
          updatedAt: Utils.toDate(project.updated_at),
          archived: project.archived,
          organization,
        },
      },
    ];

    const isCommunity =
    ctx?.config?.edition_configs?.edition === Edition.COMMUNITY;

    const writeInclusion = project.syncRepoData && !isCommunity;
    if (writeInclusion) {
      res.push({
        model: 'faros_VcsRepositoryOptions',
        record: {
          repository: {uid: project.id, name: project.id, organization},
          inclusion: {category: 'Included'},
        },
      });
    }

    return res;
  }
}
