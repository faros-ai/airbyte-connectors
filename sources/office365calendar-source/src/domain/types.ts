/**
 * Immutable Branded Types - Enterprise-Grade Type Safety for Office 365 Calendar
 * 
 * This module implements compile-time type safety using branded types to prevent
 * mixing different ID types (CalendarId vs EventId) and ensures immutability
 * throughout the system.
 * 
 * Key Features:
 * - Compile-time prevention of ID mixing
 * - Immutable value objects with structural equality
 * - Runtime validation with meaningful error messages
 * - Hash code generation for efficient collections
 * - JSON serialization support
 * 
 * @example
 * ```typescript
 * const tenantId = createTenantId('12345678-1234-5678-9abc-123456789012');
 * const calendarId = createCalendarId('calendar_123');
 * 
 * // This would cause a TypeScript compilation error:
 * // function requiresTenantId(id: TenantId) { }
 * // requiresTenantId(calendarId); // Error: Argument of type 'CalendarId' is not assignable to parameter of type 'TenantId'
 * ```
 */

// Brand symbols for compile-time type distinction
const TENANT_ID_BRAND = Symbol('TENANT_ID_BRAND');
const CLIENT_ID_BRAND = Symbol('CLIENT_ID_BRAND');
const CALENDAR_ID_BRAND = Symbol('CALENDAR_ID_BRAND');
const EVENT_ID_BRAND = Symbol('EVENT_ID_BRAND');
const USER_ID_BRAND = Symbol('USER_ID_BRAND');
const TIMESTAMP_BRAND = Symbol('TIMESTAMP_BRAND');

/**
 * Base interface for all branded types, ensuring immutability and providing
 * common operations like equality checking and serialization.
 */
interface BrandedType<T, Brand> {
  readonly [key: symbol]: Brand;
  readonly value: T;
  equals(other: BrandedType<T, Brand>): boolean;
  toString(): string;
  hashCode(): number;
}

/**
 * GUID validation pattern for Microsoft Office 365 tenant and client IDs
 */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maximum allowed length for ID strings to prevent memory issues
 */
const MAX_ID_LENGTH = 256;

/**
 * Tenant ID - Identifies an Office 365 tenant/organization
 * Must be a valid GUID format
 */
export interface TenantId extends BrandedType<string, typeof TENANT_ID_BRAND> {
  readonly [TENANT_ID_BRAND]: typeof TENANT_ID_BRAND;
  isValid(): boolean;
}

/**
 * Client ID - Identifies an Azure AD application
 * Must be a valid GUID format
 */
export interface ClientId extends BrandedType<string, typeof CLIENT_ID_BRAND> {
  readonly [CLIENT_ID_BRAND]: typeof CLIENT_ID_BRAND;
  isValid(): boolean;
}

/**
 * Calendar ID - Identifies a specific calendar within Office 365
 * Can be any non-empty string
 */
export interface CalendarId extends BrandedType<string, typeof CALENDAR_ID_BRAND> {
  readonly [CALENDAR_ID_BRAND]: typeof CALENDAR_ID_BRAND;
}

/**
 * Event ID - Identifies a specific event within a calendar
 * Can be any non-empty string
 */
export interface EventId extends BrandedType<string, typeof EVENT_ID_BRAND> {
  readonly [EVENT_ID_BRAND]: typeof EVENT_ID_BRAND;
}

/**
 * User ID - Identifies a user in Office 365
 * Can be any non-empty string
 */
export interface UserId extends BrandedType<string, typeof USER_ID_BRAND> {
  readonly [USER_ID_BRAND]: typeof USER_ID_BRAND;
}

/**
 * Timestamp - Represents a point in time as milliseconds since Unix epoch
 * Must be non-negative
 */
export interface Timestamp extends BrandedType<number, typeof TIMESTAMP_BRAND> {
  readonly [TIMESTAMP_BRAND]: typeof TIMESTAMP_BRAND;
  toDate(): Date;
  toISOString(): string;
  isBefore(other: Timestamp): boolean;
  isAfter(other: Timestamp): boolean;
}

/**
 * Internal implementation for GUID-based branded types (TenantId, ClientId)
 */
class GuidBrandedType<Brand> implements BrandedType<string, Brand> {
  readonly [key: symbol]: Brand;
  readonly value: string;

  constructor(value: string, brand: Brand, brandSymbol: symbol) {
    // Validation
    if (value == null) {
      throw new Error('ID cannot be null or undefined');
    }
    
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      throw new Error('ID cannot be empty');
    }
    
    if (!GUID_PATTERN.test(trimmedValue)) {
      throw new Error('Invalid GUID format. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
    }
    
    this.value = trimmedValue.toLowerCase(); // Normalize to lowercase
    (this as any)[brandSymbol] = brand;
    
    // Freeze the object to ensure true immutability
    Object.freeze(this);
  }

  equals(other: BrandedType<string, Brand>): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  hashCode(): number {
    // Simple hash function for string values
    let hash = 0;
    for (let i = 0; i < this.value.length; i++) {
      const char = this.value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  isValid(): boolean {
    return GUID_PATTERN.test(this.value);
  }
}

/**
 * Internal implementation for string-based branded types (CalendarId, EventId, UserId)
 */
class StringBrandedType<Brand> implements BrandedType<string, Brand> {
  readonly [key: symbol]: Brand;
  readonly value: string;

  constructor(value: string, brand: Brand, brandSymbol: symbol) {
    // Validation
    if (value == null) {
      throw new Error('ID cannot be null or undefined');
    }
    
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      throw new Error('ID cannot be empty');
    }
    
    if (trimmedValue.length > MAX_ID_LENGTH) {
      throw new Error(`ID too long. Maximum length is ${MAX_ID_LENGTH} characters`);
    }
    
    this.value = trimmedValue;
    (this as any)[brandSymbol] = brand;
    
    // Freeze the object to ensure true immutability
    Object.freeze(this);
  }

  equals(other: BrandedType<string, Brand>): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  hashCode(): number {
    // Simple hash function for string values
    let hash = 0;
    for (let i = 0; i < this.value.length; i++) {
      const char = this.value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

/**
 * Internal implementation for timestamp branded type
 */
class TimestampBrandedType implements Timestamp {
  readonly [TIMESTAMP_BRAND]: typeof TIMESTAMP_BRAND;
  readonly [key: symbol]: any;
  readonly value: number;

  constructor(value: number) {
    // Validation
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Timestamp must be a valid number');
    }
    
    if (value < 0) {
      throw new Error('Timestamp cannot be negative');
    }
    
    if (!Number.isInteger(value)) {
      throw new Error('Timestamp must be an integer (milliseconds since epoch)');
    }
    
    this.value = value;
    (this as any)[TIMESTAMP_BRAND] = TIMESTAMP_BRAND;
    
    // Freeze the object to ensure true immutability
    Object.freeze(this);
  }

  equals(other: Timestamp): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }

  hashCode(): number {
    return this.value;
  }

  toDate(): Date {
    return new Date(this.value);
  }

  toISOString(): string {
    return this.toDate().toISOString();
  }

  isBefore(other: Timestamp): boolean {
    return this.value < other.value;
  }

  isAfter(other: Timestamp): boolean {
    return this.value > other.value;
  }
}

/**
 * Factory function to create a TenantId
 * @param value - GUID string representing the tenant ID
 * @returns Immutable TenantId instance
 * @throws Error if value is not a valid GUID
 */
export const createTenantId = (value: string): TenantId => {
  return new GuidBrandedType(value, TENANT_ID_BRAND, TENANT_ID_BRAND as any) as TenantId;
};

/**
 * Factory function to create a ClientId
 * @param value - GUID string representing the client ID
 * @returns Immutable ClientId instance
 * @throws Error if value is not a valid GUID
 */
export const createClientId = (value: string): ClientId => {
  return new GuidBrandedType(value, CLIENT_ID_BRAND, CLIENT_ID_BRAND as any) as ClientId;
};

/**
 * Factory function to create a CalendarId
 * @param value - Non-empty string representing the calendar ID
 * @returns Immutable CalendarId instance
 * @throws Error if value is empty or null
 */
export const createCalendarId = (value: string): CalendarId => {
  return new StringBrandedType(value, CALENDAR_ID_BRAND, CALENDAR_ID_BRAND as any) as CalendarId;
};

/**
 * Factory function to create an EventId
 * @param value - Non-empty string representing the event ID
 * @returns Immutable EventId instance
 * @throws Error if value is empty or null
 */
export const createEventId = (value: string): EventId => {
  return new StringBrandedType(value, EVENT_ID_BRAND, EVENT_ID_BRAND as any) as EventId;
};

/**
 * Factory function to create a UserId
 * @param value - Non-empty string representing the user ID
 * @returns Immutable UserId instance
 * @throws Error if value is empty or null
 */
export const createUserId = (value: string): UserId => {
  return new StringBrandedType(value, USER_ID_BRAND, USER_ID_BRAND as any) as UserId;
};

/**
 * Factory function to create a Timestamp
 * @param value - Non-negative integer representing milliseconds since Unix epoch
 * @returns Immutable Timestamp instance
 * @throws Error if value is negative or not an integer
 */
export const createTimestamp = (value: number): Timestamp => {
  return new TimestampBrandedType(value);
};

/**
 * Type guards for runtime type checking
 */
export namespace TenantId {
  export const isTenantId = (value: any): value is TenantId => {
    return value != null && 
           typeof value === 'object' && 
           TENANT_ID_BRAND in value &&
           typeof value.value === 'string';
  };
}

export namespace ClientId {
  export const isClientId = (value: any): value is ClientId => {
    return value != null && 
           typeof value === 'object' && 
           CLIENT_ID_BRAND in value &&
           typeof value.value === 'string';
  };
}

export namespace CalendarId {
  export const isCalendarId = (value: any): value is CalendarId => {
    return value != null && 
           typeof value === 'object' && 
           CALENDAR_ID_BRAND in value &&
           typeof value.value === 'string';
  };
}

export namespace EventId {
  export const isEventId = (value: any): value is EventId => {
    return value != null && 
           typeof value === 'object' && 
           EVENT_ID_BRAND in value &&
           typeof value.value === 'string';
  };
}

export namespace UserId {
  export const isUserId = (value: any): value is UserId => {
    return value != null && 
           typeof value === 'object' && 
           USER_ID_BRAND in value &&
           typeof value.value === 'string';
  };
}

export namespace Timestamp {
  export const isTimestamp = (value: any): value is Timestamp => {
    return value != null && 
           typeof value === 'object' && 
           TIMESTAMP_BRAND in value &&
           typeof value.value === 'number';
  };
}

/**
 * Utility functions for working with collections of branded types
 */
export namespace BrandedTypes {
  /**
   * Creates a Map optimized for branded type keys
   */
  export const createMap = <K extends BrandedType<any, any>, V>(): Map<string, V> => {
    return new Map<string, V>();
  };

  /**
   * Creates a Set optimized for branded type values
   */
  export const createSet = <T extends BrandedType<any, any>>(): Set<string> => {
    return new Set<string>();
  };

  /**
   * Converts a branded type to its string representation for use as map key
   */
  export const toMapKey = <T extends BrandedType<any, any>>(brandedType: T): string => {
    return brandedType.toString();
  };
}

/**
 * JSON serialization helpers for branded types
 */
export namespace Serialization {
  /**
   * Serializes a branded type to a plain object for JSON
   */
  export const toBrandedTypeJson = <T extends BrandedType<any, any>>(
    brandedType: T
  ): { value: T['value']; type: string } => {
    const typeName = Object.getOwnPropertySymbols(brandedType)
      .find(sym => sym.toString().includes('_BRAND'))
      ?.toString() || 'unknown';
    
    return {
      value: brandedType.value,
      type: typeName
    };
  };

  /**
   * Deserializes a plain object back to a branded type
   */
  export const fromBrandedTypeJson = (
    json: { value: any; type: string }
  ): TenantId | ClientId | CalendarId | EventId | UserId | Timestamp => {
    switch (json.type) {
      case 'Symbol(TENANT_ID_BRAND)':
        return createTenantId(json.value);
      case 'Symbol(CLIENT_ID_BRAND)':
        return createClientId(json.value);
      case 'Symbol(CALENDAR_ID_BRAND)':
        return createCalendarId(json.value);
      case 'Symbol(EVENT_ID_BRAND)':
        return createEventId(json.value);
      case 'Symbol(USER_ID_BRAND)':
        return createUserId(json.value);
      case 'Symbol(TIMESTAMP_BRAND)':
        return createTimestamp(json.value);
      default:
        throw new Error(`Unknown branded type: ${json.type}`);
    }
  };
}