import {sortBy} from 'lodash';
import {VError} from 'verror';

import {GraphQLClient} from './graphql-client';
import {Operation, TimestampedRecord} from './types';
import {WriteStats} from './write-stats';

export interface RecordProcessorHandler {
  handleRecordProcessingError: (
    stats: WriteStats,
    processRecord: () => Promise<void>
  ) => Promise<void>;
}

export class GraphQLWriter {
  private readonly timestampedRecords: TimestampedRecord[] = [];

  constructor(
    private readonly graphQLClient: GraphQLClient,
    private readonly origin: string,
    private readonly stats: WriteStats,
    private readonly recordProcessorHandler: RecordProcessorHandler
  ) {}

  async write(result: any): Promise<boolean> {
    const [baseModel, operation] = result.model.split('__', 2);

    if (!operation) {
      await this.graphQLClient.writeRecord(
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
        `Unsupported model operation ${operation} for ${result.model}: ${result.record}`
      );
    }
  }

  async end(): Promise<void> {
    for (const record of sortBy(this.timestampedRecords, (r) => r.at)) {
      await this.recordProcessorHandler.handleRecordProcessingError(
        this.stats,
        async () => {
          await this.graphQLClient.writeTimestampedRecord(record);
          this.stats.recordsWritten++;
          this.stats.incrementWrittenByModel(
            `${record.model}__${record.operation}`
          );
        }
      );
    }
  }

  async flush(): Promise<void> {
    await Promise.resolve();
  }
}
