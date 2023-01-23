import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Workspace} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Workspaces extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const workspace = record.record.data as Workspace;
    const source = this.streamName.source;
    const results: DestinationRecord[] = [];
    results.push({
      model: 'tms_Project',
      record: {
        uid: workspace.id,
        name: workspace.name,
        source,
      },
    });
    for (const member of workspace.members ?? []) {
      results.push({
        model: 'tms_User',
        record: {
          uid: `${member.user.id}`,
          emailAddress: member.user.email,
          name: member.user.username,
        },
      });
    }
    return results;
  }
}
