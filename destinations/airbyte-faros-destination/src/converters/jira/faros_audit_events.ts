import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Version2Models} from 'jira.js';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosAuditEvents extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info(JSON.stringify(record));
    return [];
  }

  private createDeletionRecord(
    model: string,
    where: object
  ): DestinationRecord {
    return {
      model,
      record: {
        flushRequired: false,
        where,
      },
    };
  }

  private extractIssueKey(
    auditRecord: Version2Models.AuditRecord
  ): string | undefined {
    return auditRecord.objectItem?.name;
  }
}
