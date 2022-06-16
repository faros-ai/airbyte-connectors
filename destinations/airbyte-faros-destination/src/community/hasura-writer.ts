import {AirbyteLogger} from 'faros-airbyte-cdk';
import {sortBy} from 'lodash';
import {VError} from 'verror';

import {WriteStats} from '../common/write-stats';
import {HasuraClient} from './hasura-client';
import {Operation, TimestampedRecord} from './types';

export interface RecordProcessorHandler {
  handleRecordProcessingError: (
    stats: WriteStats,
    processRecord: () => Promise<void>
  ) => Promise<void>;
}

export class HasuraWriter {
  private readonly timestampedRecords: TimestampedRecord[] = [];

  constructor(
    private readonly hasuraClient: HasuraClient,
    private readonly origin: string,
    private readonly stats: WriteStats,
    private readonly recordProcessorHandler: RecordProcessorHandler
  ) {}

  async write(result: any): Promise<boolean> {
    const [baseModel, operation] = result.model.split('__', 2);

    if (!operation) {
      await this.hasuraClient.writeRecord(
        result.model,
        result.record,
        this.origin
      );
      return false;
    } else if (Object.values(Operation).includes(operation as Operation)) {
      this.timestampedRecords.push({
        model: baseModel,
        operation,
        origin: this.origin,
        ...result.record,
      } as TimestampedRecord);
      return true;
    } else {
      throw new VError(
        `Unuspported model operation ${operation} for ${result.model}: ${result.record}`
      );
    }
  }

  async end(): Promise<void> {
    for (const record of sortBy(this.timestampedRecords, (r) => r.at)) {
      await this.recordProcessorHandler.handleRecordProcessingError(
        this.stats,
        async () => {
          await this.hasuraClient.writeTimestampedRecord(record);
          this.stats.recordsWritten++;
          this.stats.incrementWrittenByModel(
            `${record.model}__${record.operation}`
          );
        }
      );
    }
  }
}
