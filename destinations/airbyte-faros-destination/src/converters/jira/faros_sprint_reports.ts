import {AirbyteRecord} from 'faros-airbyte-cdk';
import {SprintReport} from 'faros-airbyte-common/jira';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter, JiraStatusCategories} from './common';

export class FarosSprintReports extends JiraConverter {
  get destinationModels(): ReadonlyArray<DestinationModel> {
    return ['tms_SprintReport'];
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
