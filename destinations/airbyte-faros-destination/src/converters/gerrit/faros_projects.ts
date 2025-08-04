import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GerritCommon, GerritConverter} from './common';

export class FarosProjects extends GerritConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data;
    const source = this.gerritSource();
    
    // Extract org and repo from project name
    const {org, repo} = GerritCommon.extractProjectOrg(project.name);
    const organization = {
      uid: org,
      source,
    };

    const res: DestinationRecord[] = [];

    // Create vcs_Repository
    res.push({
      model: 'vcs_Repository',
      record: {
        name: repo,
        uid: repo,
        fullName: project.name,
        description: Utils.cleanAndTruncate(project.description),
        private: project.state !== 'ACTIVE',
        archived: project.state === 'READ_ONLY',
        organization,
      },
    });

    // Create TMS entities for the project
    const projectKey = {
      uid: GerritCommon.sanitizeUid(project.name),
      source,
    };

    res.push({
      model: 'tms_Project',
      record: {
        ...projectKey,
        name: project.name,
        description: Utils.cleanAndTruncate(project.description),
      },
    });

    res.push({
      model: 'tms_TaskBoard',
      record: {
        ...projectKey,
        name: project.name,
      },
    });

    res.push({
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: projectKey,
        project: projectKey,
      },
    });

    return res;
  }
}