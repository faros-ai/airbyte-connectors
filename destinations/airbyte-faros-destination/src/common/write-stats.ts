import {AirbyteLogger} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

export class WriteStats {
  constructor(
    public messagesRead: number = 0,
    public recordsRead: number = 0,
    public recordsProcessed: number = 0,
    public recordsWritten: number = 0,
    public recordsErrored: number = 0,
    public recordsSkipped: number = 0,
    public processedByStream: Dictionary<number> = {},
    public writtenByModel: Dictionary<number> = {}
  ) {}

  incrementProcessedByStream(stream: string): void {
    const count = this.processedByStream[stream];
    this.processedByStream[stream] = count ? count + 1 : 1;
  }

  incrementWrittenByModel(model: string): void {
    const count = this.writtenByModel[model];
    this.writtenByModel[model] = count ? count + 1 : 1;
  }

  log(logger: AirbyteLogger, writeMsg: 'Wrote' | 'Would write'): void {
    logger.info(`Read ${this.messagesRead} messages`);
    logger.info(`Read ${this.recordsRead} records`);
    logger.info(`Processed ${this.recordsProcessed} records`);

    const processed = _(this.processedByStream)
      .toPairs()
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    logger.info(`Processed records by stream: ${JSON.stringify(processed)}`);

    logger.info(`${writeMsg} ${this.recordsWritten} records`);
    const written = _(this.writtenByModel)
      .toPairs()
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    logger.info(`${writeMsg} records by model: ${JSON.stringify(written)}`);

    logger.info(`Skipped ${this.recordsSkipped} records`);
    logger.info(`Errored ${this.recordsErrored} records`);
  }

  asObject(): Dictionary<any> {
    return {
      messagesRead: this.messagesRead,
      recordsRead: this.recordsRead,
      recordsProcessed: this.recordsProcessed,
      recordsWritten: this.recordsWritten,
      recordsErrored: this.recordsErrored,
      recordsSkipped: this.recordsSkipped,
      processedByStream: this.processedByStream,
      writtenByModel: this.writtenByModel,
    };
  }
}
