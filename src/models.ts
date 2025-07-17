import { VError } from 'verror';

// Export VError type for external use
export type VErrorType = InstanceType<typeof VError>;

// Branded types for compile-time safety
export type TenantId = string & { readonly __brand: 'TenantId' };
export type CalendarId = string & { readonly __brand: 'CalendarId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type DeltaToken = string & { readonly __brand: 'DeltaToken' };

// Result type for explicit error handling
export type Result<T, E = VErrorType> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// Configuration types
export interface ConnectorConfig {
  readonly tenant_id: TenantId;
  readonly client_id: string;
  readonly client_secret: string;
  readonly calendars_to_sync?: readonly CalendarId[];
  readonly sync_all_calendars?: boolean;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly calendar_ids?: readonly CalendarId[];
  readonly domain_wide_delegation?: boolean;
  readonly events_max_results?: number;
  readonly calendar_ids?: readonly CalendarId[];
  readonly domain_wide_delegation?: boolean;
  readonly events_max_results?: number;
}

// Alias for backward compatibility
export type Office365CalendarConfig = ConnectorConfig;

// Calendar and Event types
export interface Calendar {
  readonly id: CalendarId;
  readonly name: string;
  readonly owner: {
    readonly name: string;
    readonly email: string;
  };
  readonly canEdit: boolean;
  readonly isDefaultCalendar: boolean;
  readonly color: string;
  readonly hexColor: string;
  readonly canShare?: boolean;
  readonly canViewPrivateItems?: boolean;
  readonly description?: string;
}

export interface CalendarEvent {
  readonly id: string;
  readonly calendarId: CalendarId;
  readonly subject: string;
  readonly body?: {
    readonly contentType: string;
    readonly content: string;
  };
  readonly start: {
    readonly dateTime: string;
    readonly timeZone: string;
    readonly date?: string;
  };
  readonly end: {
    readonly dateTime: string;
    readonly timeZone: string;
    readonly date?: string;
  };
  readonly isAllDay: boolean;
  readonly isCancelled: boolean;
  readonly importance: 'low' | 'normal' | 'high';
  readonly sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  readonly organizer?: {
    readonly emailAddress: {
      readonly name: string;
      readonly address: string;
    };
  };
  readonly attendees: readonly {
    readonly emailAddress: {
      readonly name: string;
      readonly address: string;
    };
    readonly status: {
      readonly response: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
      readonly time: string;
    };
    readonly type?: 'required' | 'optional';
  }[];
  readonly createdDateTime: string;
  readonly lastModifiedDateTime: string;
  readonly showAs?: string;
  readonly location?: {
    readonly displayName: string;
  };
  readonly '@removed'?: any;
}

// Alias for backward compatibility
export type Event = CalendarEvent;

// Deleted event type for incremental sync
export interface DeletedEvent {
  readonly id: string;
  readonly calendarId: CalendarId;
  readonly deletedDateTime: string;
}

// Stream state for incremental sync
export interface StreamState {
  readonly deltaToken?: DeltaToken;
  readonly lastModified?: string;
}

// Error handling utilities
export const ErrorUtils = {
  toVError: (error: unknown, message?: string): VErrorType => {
    if (error instanceof VError) {
      return error;
    }
    if (error instanceof Error) {
      return new VError(error, message || error.message);
    }
    return new VError(message || 'Unknown error');
  },

  isVError: (error: unknown): error is VErrorType => {
    return error instanceof VError;
  },

  fromError: (error: Error, context?: string): VErrorType => {
    return new VError(error, context || error.message);
  },

  getMessage: (error: VErrorType): string => {
    return error.message;
  }
};

// Result utilities for functional error handling
export const ResultUtils = {
  success: <T>(data: T): Result<T> => ({ success: true, data }),
  
  error: <T>(error: VErrorType): Result<T> => ({ success: false, error }),
  
  fromPromise: async <T>(promise: Promise<T>): Promise<Result<T>> => {
    try {
      const data = await promise;
      return ResultUtils.success(data);
    } catch (error) {
      return ResultUtils.error(ErrorUtils.toVError(error));
    }
  },

  getError: <T>(result: Result<T>): VErrorType | null => {
    if (!result.success) {
      return (result as { readonly success: false; readonly error: VErrorType }).error;
    }
    return null;
  },

  getData: <T>(result: Result<T>): T | null => {
    if (result.success) {
      return result.data;
    }
    return null;
  },

  map: <T, U>(result: Result<T>, fn: (data: T) => U): Result<U> => {
    if (result.success) {
      return ResultUtils.success(fn(result.data));
    }
    return result as Result<U>;
  },

  flatMap: <T, U>(result: Result<T>, fn: (data: T) => Result<U>): Result<U> => {
    if (result.success) {
      return fn(result.data);
    }
    return result as Result<U>;
  }
};

// Type guards for branded types
export const TypeGuards = {
  isTenantId: (value: string): value is TenantId => {
    // Basic validation for Azure AD tenant ID format
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  },

  isCalendarId: (value: string): value is CalendarId => {
    // Basic validation for calendar ID format
    return value.length > 0 && typeof value === 'string';
  },

  isUserId: (value: string): value is UserId => {
    // Basic validation for user ID format
    return value.length > 0 && typeof value === 'string';
  },

  isDeltaToken: (value: string): value is DeltaToken => {
    // Basic validation for delta token format
    return value.length > 0 && typeof value === 'string';
  }
};

// Factory functions for branded types
export const TypeFactory = {
  createTenantId: (value: string): TenantId => {
    if (!TypeGuards.isTenantId(value)) {
      throw new VError(`Invalid tenant ID format: ${value}`);
    }
    return value as TenantId;
  },

  createCalendarId: (value: string): CalendarId => {
    if (!TypeGuards.isCalendarId(value)) {
      throw new VError(`Invalid calendar ID: ${value}`);
    }
    return value as CalendarId;
  },

  createUserId: (value: string): UserId => {
    if (!TypeGuards.isUserId(value)) {
      throw new VError(`Invalid user ID: ${value}`);
    }
    return value as UserId;
  },

  createDeltaToken: (value: string): DeltaToken => {
    if (!TypeGuards.isDeltaToken(value)) {
      throw new VError(`Invalid delta token: ${value}`);
    }
    return value as DeltaToken;
  }
};

// Logging utilities
export const LogUtils = {
  createStructuredLogger: (context: Record<string, unknown>) => ({
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(JSON.stringify({ level: 'info', message, context, ...data }));
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.warn(JSON.stringify({ level: 'warn', message, context, ...data }));
    },
    error: (message: string, data?: Record<string, unknown>) => {
      console.error(JSON.stringify({ level: 'error', message, context, ...data }));
    },
    debug: (message: string, data?: Record<string, unknown>) => {
      console.debug(JSON.stringify({ level: 'debug', message, context, ...data }));
    }
  })
};

// Configuration validation
export const validateOffice365CalendarConfig = (config: unknown): Office365CalendarConfig => {
  if (!config || typeof config !== 'object') {
    throw new VError('Configuration must be an object');
  }
  
  const configObj = config as Record<string, unknown>;
  
  if (typeof configObj['tenant_id'] !== 'string') {
    throw new VError('tenant_id is required and must be a string');
  }
  
  if (typeof configObj['client_id'] !== 'string') {
    throw new VError('client_id is required and must be a string');
  }
  
  if (typeof configObj['client_secret'] !== 'string') {
    throw new VError('client_secret is required and must be a string');
  }
  
  const tenantId = TypeFactory.createTenantId(configObj['tenant_id']);
  
  return {
    tenant_id: tenantId,
    client_id: configObj['client_id'],
    client_secret: configObj['client_secret'],
    calendars_to_sync: configObj['calendars_to_sync'] as CalendarId[] | undefined,
    sync_all_calendars: configObj['sync_all_calendars'] as boolean | undefined,
    cutoff_days: configObj['cutoff_days'] as number | undefined,
    page_size: configObj['page_size'] as number | undefined,
    calendar_ids: configObj['calendar_ids'] as CalendarId[] | undefined,
    domain_wide_delegation: configObj['domain_wide_delegation'] as boolean | undefined,
    events_max_results: configObj['events_max_results'] as number | undefined,
  };
};

// Additional types for compatibility
export interface GraphCalendar extends Calendar {}
export interface GraphEvent extends CalendarEvent {}
export interface EventDelta {
  readonly value: readonly CalendarEvent[];
  readonly '@odata.deltaLink'?: string;
  readonly '@odata.nextLink'?: string;
}
export interface BatchCalendarResult {
  readonly calendars: readonly Calendar[];
  readonly errors: readonly VErrorType[];
}
export interface SDKConfiguration extends ConnectorConfig {}

// Type checking functions
export const isCalendar = (obj: unknown): obj is Calendar => {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'name' in obj;
};

export const isGraphEvent = (obj: unknown): obj is GraphEvent => {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'subject' in obj;
};

export const isDeletedEvent = (obj: unknown): obj is DeletedEvent => {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'deletedDateTime' in obj;
};

// Type conversion functions
export const asCalendarId = (value: string): CalendarId => {
  return TypeFactory.createCalendarId(value);
};

export const asTenantId = (value: string): TenantId => {
  return TypeFactory.createTenantId(value);
};

export const asUserId = (value: string): UserId => {
  return TypeFactory.createUserId(value);
};

export const asDeltaToken = (value: string): DeltaToken => {
  return TypeFactory.createDeltaToken(value);
}; 