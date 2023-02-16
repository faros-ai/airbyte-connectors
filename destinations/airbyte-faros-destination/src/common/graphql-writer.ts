import {sortBy} from 'lodash';
import {Dictionary} from 'ts-essentials';
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

export interface OriginProvider {
  getOrigin: (record: Dictionary<any>) => string;
}

export class GraphQLWriter {
  private readonly timestampedRecords: TimestampedRecord[] = [];

  constructor(
    private readonly graphQLClient: GraphQLClient,
    private readonly originProvider: OriginProvider,
    private readonly stats: WriteStats,
    private readonly recordProcessorHandler: RecordProcessorHandler
  ) {}

  async write(result: any): Promise<boolean> {
    const [baseModel, operation] = (result.model as string).split('__', 2);

    if (!operation) {
      await this.graphQLClient.writeRecord(
        result.model,
        result.record,
        this.originProvider.getOrigin(result.record)
      );
      return false;
    } else if (Object.values(Operation).includes(operation as Operation)) {
      this.timestampedRecords.push({
        ...result.record,
        model: baseModel,
        operation,
        origin: this.originProvider.getOrigin(result.record),
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
    await this.graphQLClient.flush();
  }
}
