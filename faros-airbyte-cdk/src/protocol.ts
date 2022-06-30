import {toPlainObject} from 'lodash';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {wrapApiError} from './errors';

export enum AirbyteLogLevel {
  FATAL = 'FATAL',
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  TRACE = 'TRACE',
}

export function AirbyteLogLevelOrder(level: AirbyteLogLevel): number {
  switch (level) {
    case AirbyteLogLevel.FATAL:
      return 60;
    case AirbyteLogLevel.ERROR:
      return 50;
    case AirbyteLogLevel.WARN:
      return 40;
    case AirbyteLogLevel.INFO:
      return 30;
    case AirbyteLogLevel.DEBUG:
      return 20;
    case AirbyteLogLevel.TRACE:
      return 10;
  }
}

export enum AirbyteMessageType {
  CATALOG = 'CATALOG',
  CONNECTION_STATUS = 'CONNECTION_STATUS',
  LOG = 'LOG',
  RECORD = 'RECORD',
  SPEC = 'SPEC',
  STATE = 'STATE',
  TRACE = 'TRACE',
}

export enum AirbyteConnectionStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export type AirbyteConfig = Dictionary<any>;

export function parseAirbyteMessage(s: string): AirbyteMessage {
  try {
    const res: AirbyteMessage = JSON.parse(s);
    if (!res.type) {
      throw new VError(`Message type is not set`);
    }
    switch (res.type) {
      case AirbyteMessageType.RECORD:
        return new AirbyteRecord((res as AirbyteRecord).record);
      case AirbyteMessageType.CATALOG:
      case AirbyteMessageType.CONNECTION_STATUS:
      case AirbyteMessageType.LOG:
      case AirbyteMessageType.SPEC:
      case AirbyteMessageType.STATE:
        return res;
      default:
        throw new VError(`Unsupported message type ${res.type}`);
    }
  } catch (e) {
    throw new VError(e, `Invalid Airbyte message: ${s}`);
  }
}

export interface AirbyteMessage {
  readonly type: AirbyteMessageType;
}

export enum SyncMode {
  FULL_REFRESH = 'full_refresh',
  INCREMENTAL = 'incremental',
}

export enum DestinationSyncMode {
  APPEND = 'append',
  OVERWRITE = 'overwrite',
  APPEND_DEDUP = 'append_dedup',
}

export interface AirbyteStream {
  name: string;
  json_schema: Dictionary<any>;
  supported_sync_modes?: SyncMode[];
  source_defined_cursor?: boolean;
  default_cursor_field?: string[];
  source_defined_primary_key?: string[][];
  namespace?: string;
}

export interface AirbyteCatalog {
  streams: AirbyteStream[];
}

export class AirbyteCatalogMessage implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.CATALOG;
  constructor(readonly catalog: AirbyteCatalog) {}
}

export interface AirbyteConfiguredStream {
  stream: AirbyteStream;
  sync_mode: SyncMode;
  cursor_field?: string[];
  destination_sync_mode?: DestinationSyncMode;
  primary_key?: string[][];
}

export interface AirbyteConfiguredCatalog {
  streams: AirbyteConfiguredStream[];
}

export class AirbyteConnectionStatusMessage implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.CONNECTION_STATUS;
  constructor(
    readonly connectionStatus: {
      status: AirbyteConnectionStatus;
      message?: string;
    }
  ) {}
}

export class AirbyteLog implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.LOG;
  constructor(
    readonly log: {
      level: AirbyteLogLevel;
      message: string;
    }
  ) {}
  static make(level: AirbyteLogLevel, message: string): AirbyteLog {
    return new AirbyteLog({level, message});
  }
}

export const AirbyteRawStreamPrefix = '_airbyte_raw_';
export const AirbyteRawABId = '_airbyte_ab_id';
export const AirbyteRawEmittedAt = '_airbyte_emitted_at';
export const AirbyteRawData = '_airbyte_data';

export class AirbyteRecord implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.RECORD;
  constructor(
    readonly record: {
      stream: string;
      namespace?: string;
      emitted_at: number;
      data: Dictionary<any>;
    }
  ) {}

  isRaw(): boolean {
    const stream = this.record.stream;
    return stream && stream.startsWith(AirbyteRawStreamPrefix);
  }

  unpackRaw(): AirbyteRecord {
    if (this.isRaw()) {
      return new AirbyteRecord({
        stream: this.record.stream.slice(AirbyteRawStreamPrefix.length),
        emitted_at: new Date(this.record.data[AirbyteRawEmittedAt]).getTime(),
        data: JSON.parse(this.record.data[AirbyteRawData]),
      });
    }
    return this;
  }

  static make(
    stream: string,
    data: Dictionary<any>,
    namespace?: string
  ): AirbyteRecord {
    return new AirbyteRecord({
      stream,
      namespace,
      emitted_at: Date.now(),
      data,
    });
  }
}

interface AirbyteErrorTrace {
  type: 'ERROR';
  emitted_at: number;
  error: any;
}

export class AirbyteErrorTraceMessage implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.TRACE;
  private readonly trace: AirbyteErrorTrace;
  constructor(error: any) {
    this.trace = {
      type: 'ERROR',
      emitted_at: Date.now(),
      error: wrapApiError(error),
    };
  }
}

export interface Spec {
  documentationUrl?: string;
  changelogUrl?: string;
  connectionSpecification: Dictionary<any>;
  supportsIncremental?: boolean;
  supportsNormalization?: boolean;
  supportsDBT?: boolean;
  supported_destination_sync_modes?: DestinationSyncMode[];
}

export class AirbyteSpec implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.SPEC;
  constructor(readonly spec: Spec) {}
}

export interface AirbyteState {
  [stream: string]: any;
}

export class AirbyteStateMessage implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.STATE;
  constructor(
    readonly state: {
      data: AirbyteState;
    }
  ) {}
}
