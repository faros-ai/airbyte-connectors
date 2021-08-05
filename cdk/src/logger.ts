import {
  AirbyteCatalog,
  AirbyteConnectionStatus,
  AirbyteRecord,
  AirbyteSourceState,
  AirbyteSpec,
} from './protocol';

export enum Level {
  FATAL = 'FATAL',
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  TRACE = 'TRACE',
}

export enum Type {
  RECORD = 'RECORD',
  STATE = 'STATE',
  LOG = 'LOG',
  SPEC = 'SPEC',
  CONNECTION_STATUS = 'CONNECTION_STATUS',
  CATALOG = 'CATALOG',
}

export class AirbyteLogger {
  private log(level: Level, message: string): void {
    console.log(JSON.stringify({type: Type.LOG, log: {level, message}}));
  }

  fatal(message: string): void {
    this.log(Level.FATAL, message);
  }

  error(message: string): void {
    this.log(Level.ERROR, message);
  }

  warn(message: string): void {
    this.log(Level.WARN, message);
  }

  info(message: string): void {
    this.log(Level.INFO, message);
  }

  debug(message: string): void {
    this.log(Level.DEBUG, message);
  }

  trace(message: string): void {
    this.log(Level.TRACE, message);
  }

  private writeAirbyteObject(type: Type, obj: any): void {
    console.log(JSON.stringify({type, ...obj}));
  }

  writeSpec(spec: AirbyteSpec): void {
    this.writeAirbyteObject(Type.SPEC, {spec});
  }

  writeConnectionStatus(connectionStatus: AirbyteConnectionStatus): void {
    this.writeAirbyteObject(Type.CONNECTION_STATUS, {connectionStatus});
  }

  writeCatalog(catalog: AirbyteCatalog): void {
    this.writeAirbyteObject(Type.CATALOG, {catalog});
  }

  writeRecord(stream: string, namespace: string, record: AirbyteRecord): void {
    this.writeAirbyteObject(Type.RECORD, {
      record: {stream, namespace, emitted_at: Date.now(), data: record},
    });
  }

  writeState(state: AirbyteSourceState): void {
    this.writeAirbyteObject(Type.STATE, {state: {data: state}});
  }
}
