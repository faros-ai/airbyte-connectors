import {AirbyteRecord} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosIssueAdditionalFields extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
