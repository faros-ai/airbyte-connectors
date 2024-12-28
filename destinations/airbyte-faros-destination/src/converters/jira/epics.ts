import {AirbyteRecord} from 'faros-airbyte-cdk';
import TurndownService from 'turndown';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter, JiraStatusCategories} from './common';

export class Epics extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  private turndown = new TurndownService();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const epic = record.record.data;
    const source = this.initializeSource(ctx);
    const status = epic.fields.status ?? {};
    let description = null;
    if (typeof epic.fields.description === 'string') {
      description = epic.fields.description;
    } else if (epic.renderedFields.description) {
      description = this.turndown.turndown(epic.renderedFields.description);
    }

    return [
      {
        model: 'tms_Epic',
        record: {
          uid: epic.key,
          name: epic.fields.summary ?? null,
          description: this.truncate(ctx, description),
          status: {
            category: JiraStatusCategories.get(
              JiraCommon.normalize(status.statusCategory?.name)
            ),
            detail: status.name,
          },
          project: {uid: epic.projectKey, source},
          source,
        },
      },
    ];
  }
}
