import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosEpicOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class FarosEpics extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  id(record: AirbyteRecord): string {
    const epic = record?.record?.data as FarosEpicOutput;
    return String(epic?.id);
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const epic = record.record.data as FarosEpicOutput;
    const res: DestinationRecord[] = [];

    if (!epic?.id) {
      return [];
    }

    const uid = String(epic.id);

    // Convert epic state to status category
    const statusCategory = epic.state === 'opened' ? 'Todo' : 'Done';

    // Create the epic record
    res.push({
      model: 'tms_Epic',
      record: {
        uid,
        name: epic.title,
        description: Utils.cleanAndTruncate(
          epic.description,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        status: {
          category: statusCategory,
          detail: epic.state,
        },
        source: this.streamName.source,
        createdAt: Utils.toDate(epic.created_at),
        updatedAt: Utils.toDate(epic.updated_at),
      },
    });

    return res;
  }
}
