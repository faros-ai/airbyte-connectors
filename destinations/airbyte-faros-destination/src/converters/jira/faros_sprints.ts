import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {camelCase, toString, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosSprints extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Sprint',
    'tms_SprintBoardRelationship',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
