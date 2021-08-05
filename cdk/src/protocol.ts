export interface AirbyteConnectionStatus {
  status: 'SUCCEEDED' | 'FAILED';
  message?: string;
}

// TODO: formalize the types
export type AirbyteConfig = any;

export type AirbyteCatalog = any;

export type AirbyteSourceState = any;

export type AirbyteSpec = any;

export type AirbyteRecord = any;
