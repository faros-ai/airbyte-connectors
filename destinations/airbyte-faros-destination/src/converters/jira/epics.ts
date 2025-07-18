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
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
