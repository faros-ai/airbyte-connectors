import {AirbyteRecord} from 'faros-airbyte-cdk';
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
    let projectKey;
    if (projectVersion.projectKey) {
      projectKey = projectVersion.projectKey;
    } else {
      const project = ctx.get(
        ProjectVersions.projectsStream.asString,
        String(projectVersion.projectId)
      );
      projectKey = project.record.data.key;
    }
    if (projectKey) {
      results.push({
        model: 'tms_ProjectReleaseRelationship',
        record: {
          project: {uid: projectKey, source},
          release: {uid: projectVersion.id, source},
        },
      });
    }
    return results;
  }
}
