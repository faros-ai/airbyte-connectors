import {AirbyteLogger, shouldWriteLog} from '../logger';
import {
  AirbyteLogLevel,
  AirbyteLogLevelOrder,
  AirbyteMessage,
  AirbyteSourceLog,
  AirbyteSourceLogsMessage,
  AirbyteState,
  isAirbyteLog,
} from '../protocol';
import {State} from './state';

const MAX_BATCH_SIZE_KB = 100 * 1024;

export class AirbyteSourceLogger extends AirbyteLogger {
  readonly batch: AirbyteSourceLog[] = [];
  private totalSize = 0;

  private _state: AirbyteState = {};
  private _compressState = false;

  constructor(level?: AirbyteLogLevel) {
    super(level);
  }

  get state(): AirbyteState {
    return this._compressState ? State.compress(this._state) : this._state;
  }

  set state(state: AirbyteState) {
    this._state = state;
  }

  set compressState(compressState: boolean) {
    this._compressState = compressState;
  }

  override write(msg: AirbyteMessage): void {
    super.write(msg);

    if (isAirbyteLog(msg) && shouldWriteLog(msg, this.level)) {
      const sourceLog: AirbyteSourceLog = {
        timestamp: Date.now(),
        message: {
          level: AirbyteLogLevelOrder(msg.log.level),
          msg: msg.log.message,
        },
      };

      this.batch.push(sourceLog);
      this.totalSize += JSON.stringify(sourceLog).length;
      if (this.totalSize > MAX_BATCH_SIZE_KB) {
        this.flush();
      }
    }
  }

  override flush(): void {
    if (!this.batch.length) {
      return;
    }
    super.write(
      new AirbyteSourceLogsMessage({data: {state: this.state}}, this.batch)
    );
    this.batch.length = 0; // clears the array
    this.totalSize = 0;
  }
}
