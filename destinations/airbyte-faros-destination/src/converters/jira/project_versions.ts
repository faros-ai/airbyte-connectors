import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ProjectVersion} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraConverter} from './common';

export class ProjectVersions extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Release',
    'tms_ProjectReleaseRelationship',
  ];

  private static readonly projectsStream = new StreamName('jira', 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [ProjectVersions.projectsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
