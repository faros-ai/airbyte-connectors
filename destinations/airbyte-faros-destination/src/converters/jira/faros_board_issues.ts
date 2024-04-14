import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BoardIssues as CommunityBoardIssues} from './board_issues';
import {JiraConverter} from './common';

export class FarosBoardIssues extends JiraConverter {
  private alias = new CommunityBoardIssues();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record, ctx);
  }
}
