import {AirbyteRecord} from 'faros-airbyte-cdk';
import TurndownService from 'turndown';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {normalize} from '../utils';
import {JiraConverter, JiraStatusCategories} from './common';

export class JiraEpics extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  private static readonly projectsStream = new StreamName('jira', 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraEpics.projectsStream];
  }

  private turndown = new TurndownService();

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const epic = record.record.data;
    const source = this.streamName.source;
    const status = epic.fields.status ?? {};
    let description = null;
    if (typeof epic.fields.description === 'string') {
      description = epic.fields.description;
    } else if (epic.renderedFields.description) {
      description = this.turndown.turndown(epic.renderedFields.description);
    }

    let project = null;
    const projectRecords =
      ctx.get(JiraEpics.projectsStream.stringify(), epic.projectId) ?? [];
    if (projectRecords.length > 0) {
      project = {uid: projectRecords[0].record.data.key, source};
    }

    return [
      {
        model: 'tms_Epic',
        record: {
          uid: epic.key,
          name: epic.fields.summary ?? null,
          description,
          status: {
            category: JiraStatusCategories.get(
              normalize(status.statusCategory?.name)
            ),
            detail: status.name,
          },
          project,
          source,
        },
      },
    ];
  }
}
