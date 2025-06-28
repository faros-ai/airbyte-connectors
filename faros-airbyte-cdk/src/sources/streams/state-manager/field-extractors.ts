import {Utils} from 'faros-js-client';
import {FieldExtractor} from './interfaces';

/**
 * Helper function to get nested property value from object
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Generic field extractor that extracts a field by path from a record
 */
export class PathFieldExtractor<TRecord, TFieldValue> implements FieldExtractor<TRecord, TFieldValue> {
  constructor(private readonly fieldPath: string) {}

  extract(record: TRecord): TFieldValue {
    return getNestedProperty(record, this.fieldPath);
  }
}

/**
 * Field extractor for timestamp fields that normalizes to Date
 */
export class TimestampFieldExtractor<TRecord> implements FieldExtractor<TRecord, Date> {
  constructor(private readonly fieldPath: string) {}

  extract(record: TRecord): Date {
    const value = getNestedProperty(record, this.fieldPath);
    return Utils.toDate(value ?? 0);
  }
}

/**
 * Field extractor for nested timestamp fields (e.g., record.committer.date)
 */
export class NestedTimestampFieldExtractor<TRecord> implements FieldExtractor<TRecord, Date> {
  constructor(private readonly fieldPath: string) {}

  extract(record: TRecord): Date {
    const value = getNestedProperty(record, this.fieldPath);
    return Utils.toDate(value ?? 0);
  }
}

/**
 * Factory methods for common field extractors
 */
export class FieldExtractors {
  /**
   * Create extractor for simple timestamp field
   */
  static timestamp<TRecord>(fieldPath: string): TimestampFieldExtractor<TRecord> {
    return new TimestampFieldExtractor(fieldPath);
  }

  /**
   * Create extractor for nested timestamp field
   */
  static nestedTimestamp<TRecord>(fieldPath: string): NestedTimestampFieldExtractor<TRecord> {
    return new NestedTimestampFieldExtractor(fieldPath);
  }

  /**
   * Create extractor for any field by path
   */
  static field<TRecord, TFieldValue>(fieldPath: string): PathFieldExtractor<TRecord, TFieldValue> {
    return new PathFieldExtractor(fieldPath);
  }
}