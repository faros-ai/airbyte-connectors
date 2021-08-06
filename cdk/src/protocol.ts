export enum AirbyteLogLevel {
  FATAL = 'FATAL',
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  TRACE = 'TRACE',
}

export enum AirbyteMessageType {
  CATALOG = 'CATALOG',
  CONNECTION_STATUS = 'CONNECTION_STATUS',
  LOG = 'LOG',
  RECORD = 'RECORD',
  SPEC = 'SPEC',
  STATE = 'STATE',
}

// TODO: get rid of 'any' and formalize the type
export type AirbyteConfig = any;

export interface AirbyteMessage {
  readonly type: AirbyteMessageType;
}

export class AirbyteCatalog implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.CATALOG;
  constructor(readonly catalog: any) {} // TODO: get rid of 'any' and formalize the type
}

export class AirbyteConnectionStatus implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.CONNECTION_STATUS;
  constructor(
    readonly connectionStatus: {
      status: 'SUCCEEDED' | 'FAILED';
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

export class AirbyteRecord implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.RECORD;
  constructor(
    readonly record: {
      stream: string;
      namespace: string;
      emitted_at: number;
      data: any; // TODO: get rid of 'any' and formalize the type
    }
  ) {}

  // TODO: get rid of 'any' and formalize the type
  static make(stream: string, namespace: string, data: any): AirbyteRecord {
    return new AirbyteRecord({
      stream,
      namespace,
      emitted_at: Date.now(),
      data,
    });
  }
}

export class AirbyteSpec implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.SPEC;
  constructor(readonly spec: any) {} // TODO: get rid of 'any' and formalize the type
}

export class AirbyteState implements AirbyteMessage {
  readonly type: AirbyteMessageType = AirbyteMessageType.STATE;
  constructor(
    readonly state: {
      data: any; // TODO: get rid of 'any' and formalize the type
    }
  ) {}
}
