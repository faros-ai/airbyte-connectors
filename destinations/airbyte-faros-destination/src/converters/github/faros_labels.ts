import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Label} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosLabels extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Label',
    'vcs_Label',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data as Label;
    const records = [
      {
        model: 'vcs_Label',
        record: {
          name: label.name,
        },
      },
    ];
    // If we are syncing repo issues and writing TMS models we also write all the TMS labels.
    if (this.syncRepoIssues(ctx)) {
      records.push({
        model: 'tms_Label',
        record: {
          name: label.name,
        },
      });
    }
    return records;
  }
}
