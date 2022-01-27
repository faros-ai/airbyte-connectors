import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraConverter} from './common';

export class JiraProjectVersions extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Release',
    'tms_ProjectReleaseRelationship',
  ];

  private static readonly projectsStream = new StreamName('jira', 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraProjectVersions.projectsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const projectVersion = record.record.data;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [
      {
        model: 'tms_Release',
        record: {
          uid: projectVersion.id,
          name: projectVersion.name,
          description: this.truncate(projectVersion.description),
          startedAt: Utils.toDate(projectVersion.startDate),
          releasedAt: Utils.toDate(projectVersion.releaseDate),
          source,
        },
      },
    ];
    const project = ctx.get(
      JiraProjectVersions.projectsStream.asString,
      String(projectVersion.projectId)
    );
    if (project) {
      results.push({
        model: 'tms_ProjectReleaseRelationship',
        record: {
          project: {uid: project.record.data.key, source},
          release: {uid: projectVersion.id, source},
        },
      });
    }
    return results;
  }
}
