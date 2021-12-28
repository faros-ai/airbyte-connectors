import {AirbyteRecord} from 'faros-airbyte-cdk';
import {startsWith} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Story} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Story'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const story = record.record.data as Story;
    return [
      {
        model: 'tms_Story',
        record: {
          uid: story.id,
          name: story.name,
          archived: story.archived,
          deadline: story.deadline,
          description: story.description,
          entity_type: story.entity_type,
          external_id: story.external_id,
          epic_id: story.epic_id,
          estimate: story.estimate,
          files: story.files,
          iteration_id: story.iteration_id,
          lead_time: story.lead_time,
          source,
        },
      },
    ];
  }
}
