import {Dictionary} from 'ts-essentials';

export class WriteStats {
  constructor(
    public messagesRead: number = 0,
    public recordsRead: number = 0,
    public recordsProcessed: number = 0,
    public recordsWritten: number = 0,
    public recordsErrored: number = 0,
    public processedByStream: Dictionary<number> = {},
    public writtenByModel: Dictionary<number> = {}
  ) {}

  incrementWrittenByModel(model: string): void {
    const count = this.writtenByModel[model];
    this.writtenByModel[model] = count ? count + 1 : 1;
  }

  incrementProcessedByStream(stream: string): void {
    const count = this.processedByStream[stream];
    this.processedByStream[stream] = count ? count + 1 : 1;
  }
}
