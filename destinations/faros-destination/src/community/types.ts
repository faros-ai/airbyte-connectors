import {Dictionary} from 'ts-essentials';

export enum Operation {
  UPSERT = 'Upsert',
  UPDATE = 'Update',
  DELETION = 'Deletion',
}

export interface TimestampedRecord {
  model: string;
  origin: string;
  at: number;
  operation: Operation;
}

export interface UpsertRecord extends TimestampedRecord {
  operation: Operation.UPSERT;
  data: Dictionary<any>;
}

export interface UpdateRecord extends TimestampedRecord {
  operation: Operation.UPDATE;
  where: Dictionary<any>;
  mask: string[];
  patch: Dictionary<any>;
}

export interface DeletionRecord extends TimestampedRecord {
  operation: Operation.DELETION;
  where: Dictionary<any>;
}
