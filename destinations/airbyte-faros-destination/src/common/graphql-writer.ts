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
  getOrigin: (record?: Dictionary<any>) => string;
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
      if (operation === Operation.FLUSH) {
        await this.graphQLClient.flush();
        return true;
      }

      const timestampedRecord: TimestampedRecord = {
        ...result.record,
        model: baseModel,
        operation,
        origin: this.originProvider.getOrigin(result.record),
      };

      // It's ok to submit non-timestamped record deletions while submitting
      // upserts. Non-timestamped record updates are not safe here because the
      // stream responsible for upserting the record-to-be-updated may not have
      // been processed yet.
      if (operation === Operation.DELETION && !result.record.at) {
        await this.writeTimestampedRecord(timestampedRecord);
        if (result.record.flushRequired ?? true) {
          await this.graphQLClient.flush();
        }
      } else {
        this.timestampedRecords.push(timestampedRecord);
      }
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
        async () => await this.writeTimestampedRecord(record)
      );
    }
    await this.graphQLClient.flush();
  }

  private async writeTimestampedRecord(record: TimestampedRecord) {
    await this.graphQLClient.writeTimestampedRecord(record);
    this.stats.recordsWritten++;
    this.stats.incrementWrittenByModel(`${record.model}__${record.operation}`);
  }
}
