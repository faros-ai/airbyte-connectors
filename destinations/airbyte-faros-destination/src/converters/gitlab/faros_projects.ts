import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosProjectOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabConverter} from './common';

export class FarosProjects extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'cicd_Pipeline',
    'compute_Application',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as FarosProjectOutput;
    const organization = {
      uid: toLower(project.group_id),
      source: this.streamName.source,
    };

    const projectName = toLower(project.path);

    const res: DestinationRecord[] = [
      {
        model: 'vcs_Repository',
        record: {
          name: projectName,
          uid: projectName,
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

    if (this.tmsEnabled(ctx)) {
      const projectKey = {
        uid: `${organization.uid}/${projectName}`,
        source: this.streamName.source,
      };

      res.push({
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name: project.name ?? projectName,
        },
      });

      res.push({
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: organization,
        },
      });
    }

    if (this.cicdEnabled(ctx)) {
      res.push({
        model: 'cicd_Repository',
        record: {
          uid: projectName,
          organization,
          name: project.name ?? projectName,
          description: Utils.cleanAndTruncate(project.description),
          url: project.web_url,
        },
      });

      res.push({
        model: 'cicd_Pipeline',
        record: {
          uid: projectName,
          organization,
          name: project.name ?? projectName,
          description: Utils.cleanAndTruncate(project.description),
          url: project.web_url,
        },
      });

      res.push({
        model: 'compute_Application',
        record: {
          name: project.path,
          platform: this.streamName.source,
          displayName: project.name,
          included: true,
        },
      });
    }

    const isCommunity =
      ctx?.config?.edition_configs?.edition === Edition.COMMUNITY;

    const writeInclusion = project.syncRepoData && !isCommunity;
    if (writeInclusion) {
      res.push({
        model: 'faros_VcsRepositoryOptions',
        record: {
          repository: {uid: projectName, name: projectName, organization},
          inclusion: {category: 'Included'},
        },
      });
    }

    return res;
  }
}
