/**
 * Functional Composition & Dependency Injection - Trait System in TypeScript
 * 
 * This module implements a trait system and ownership patterns through:
 * - Trait-like interfaces with explicit implementations
 * - Dependency injection with compile-time guarantees
 * - Higher-order functions for service composition
 * - Resource management following RAII (Resource Acquisition Is Initialization) patterns
 * - Zero-cost abstractions through function composition
 * 
 * Key patterns implemented:
 * - Traits: Interfaces with default implementations
 * - Ownership: Explicit resource management
 * - Borrowing: Read-only access patterns
 * - Lifetimes: Scoped resource handling
 * - Composition: Trait bounds and generic constraints
 * 
 * @example
 * ```typescript
 * // Create dependencies (with dependency injection)
 * const deps = createDependencies({ logger, httpClient, rateLimiter, tokenManager });
 * 
 * // Compose services with trait-like behavior
 * const service = withMetrics(
 *   withLogging(
 *     withRateLimit(
 *       createCalendarService(deps),
 *       rateLimiter
 *     ),
 *     logger
 *   ),
 *   'calendar_service'
 * );
 * ```
 */

import { Result } from '../patterns/result';
import { Option } from '../patterns/option';
import { CalendarId, EventId, UserId, Timestamp } from '../domain/types';
import { Event } from '../domain/events';

/**
 * Calendar domain object
 */
export interface Calendar {
  readonly id: CalendarId;
  readonly name: string;
  readonly owner: string;
  readonly timeZone: string;
  readonly description?: string;
  readonly color?: string;
  readonly isDefault?: boolean;
  readonly canEdit?: boolean;
}

/**
 * Configuration interface for Office 365 API
 */
export interface Office365Config {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tenantId: string;
  readonly calendarIds?: readonly string[];
  readonly cutoffDays?: number;
  readonly eventsMaxResults?: number;
  readonly timeoutMs?: number;
}

/**
 * Calendar-specific error types (discriminated union)
 */
export type CalendarError = 
  | { readonly type: 'authentication_failed'; readonly details: string }
  | { readonly type: 'rate_limited'; readonly retryAfter: number }
  | { readonly type: 'calendar_not_found'; readonly calendarId: string }
  | { readonly type: 'permission_denied'; readonly resource: string }
  | { readonly type: 'network_error'; readonly cause: Error }
  | { readonly type: 'timeout_error'; readonly timeoutMs: number }
  | { readonly type: 'validation_error'; readonly field: string; readonly message: string };

/**
 * Event-specific error types
 */
export type EventError = CalendarError;

/**
 * Generic service result type
 */
export type ServiceResult<T, E = CalendarError> = Result<T, E>;

/**
 * Async iterable service result for streaming
 */
export type AsyncIterableService<T, E = CalendarError> = AsyncIterable<ServiceResult<T, E>>;

/**
 * Logger trait (interface)
 */
export interface Logger {
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}

/**
 * HTTP client trait for making API requests
 */
export interface HttpClient {
  get<T>(url: string, headers?: Record<string, string>): Promise<ServiceResult<T, CalendarError>>;
  post<T>(url: string, body: any, headers?: Record<string, string>): Promise<ServiceResult<T, CalendarError>>;
  patch<T>(url: string, body: any, headers?: Record<string, string>): Promise<ServiceResult<T, CalendarError>>;
  delete<T>(url: string, headers?: Record<string, string>): Promise<ServiceResult<T, CalendarError>>;
  request<T>(config: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
  }): Promise<ServiceResult<T, CalendarError>>;
}

/**
 * Rate limiter trait for controlling API call frequency
 */
export interface RateLimiter {
  acquire(): Promise<void>;
  release(): void;
  getCurrentActiveCount(): number;
  getMaxConcurrency(): number;
}

/**
 * Token manager trait for OAuth2 authentication
 */
export interface TokenManager {
  getAccessToken(): Promise<ServiceResult<string, CalendarError>>;
  refreshToken(): Promise<ServiceResult<string, CalendarError>>;
  isTokenValid(): boolean;
  clearToken(): void;
}

/**
 * Dependency container (with dependency injection)
 */
export interface Dependencies {
  readonly logger: Logger;
  readonly httpClient: HttpClient;
  readonly rateLimiter: RateLimiter;
  readonly tokenManager: TokenManager;
}

/**
 * Calendar service trait
 */
export interface CalendarService {
  getCalendars(config: Office365Config): AsyncIterableService<Calendar>;
  getCalendar(calendarId: CalendarId, config: Office365Config): Promise<ServiceResult<Calendar>>;
}

/**
 * Event service trait
 */
export interface EventService {
  getEvents(calendarId: CalendarId, config: Office365Config): AsyncIterableService<Event>;
  getEvent(eventId: EventId, calendarId: CalendarId, config: Office365Config): Promise<ServiceResult<Event>>;
  getEventsInRange(
    calendarId: CalendarId, 
    start: Timestamp, 
    end: Timestamp, 
    config: Office365Config
  ): AsyncIterableService<Event>;
}

/**
 * Retry configuration for resilient service calls
 */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly shouldRetry: (error: CalendarError) => boolean;
}

/**
 * Metrics configuration for service monitoring
 */
export interface MetricsConfig {
  readonly serviceName: string;
  readonly collectLatency?: boolean;
  readonly collectErrorRates?: boolean;
  readonly collectThroughput?: boolean;
}

/**
 * Factory function to create dependency container with validation
 */
export const createDependencies = (deps: {
  logger: Logger;
  httpClient: HttpClient;
  rateLimiter: RateLimiter;
  tokenManager: TokenManager;
}): Dependencies => {
  // Validation with meaningful error messages
  if (!deps.logger) {
    throw new Error('Logger is required');
  }
  if (!deps.httpClient) {
    throw new Error('HttpClient is required');
  }
  if (!deps.rateLimiter) {
    throw new Error('RateLimiter is required');
  }
  if (!deps.tokenManager) {
    throw new Error('TokenManager is required');
  }

  const dependencies: Dependencies = {
    logger: deps.logger,
    httpClient: deps.httpClient,
    rateLimiter: deps.rateLimiter,
    tokenManager: deps.tokenManager
  };

  // Freeze for immutability (ownership model)
  return Object.freeze(dependencies);
};

/**
 * Calendar service implementation factory
 */
export const createCalendarService = (deps: Dependencies): CalendarService => {
  const service: CalendarService = {
    async *getCalendars(config: Office365Config): AsyncIterableService<Calendar> {
      try {
        const tokenResult = await deps.tokenManager.getAccessToken();
        if (tokenResult.isFailure()) {
          const error = tokenResult.match(
            () => null,
            (err: CalendarError) => err
          );
          yield Result.failure(error!) as ServiceResult<Calendar>;
          return;
        }

        const token = tokenResult.unwrap();
        deps.logger.debug('Fetching calendars', { calendarCount: config.calendarIds?.length || 0 });

        // Mock implementation for testing - in real implementation, this would call Microsoft Graph API
        const mockCalendars: Calendar[] = [
          {
            id: { value: 'calendar-1' } as CalendarId,
            name: 'Primary Calendar',
            owner: 'user@example.com',
            timeZone: 'UTC'
          }
        ];

        for (const calendar of mockCalendars) {
          yield Result.success(calendar);
        }
      } catch (error) {
        yield Result.failure({
          type: 'network_error',
          cause: error as Error
        });
      }
    },

    async getCalendar(calendarId: CalendarId, config: Office365Config): Promise<ServiceResult<Calendar>> {
      try {
        const tokenResult = await deps.tokenManager.getAccessToken();
        if (tokenResult.isFailure()) {
          return tokenResult.match(
            () => Result.success({} as Calendar),
            (err: CalendarError) => Result.failure(err)
          );
        }

        deps.logger.debug('Fetching calendar', { calendarId: calendarId.value });

        // Mock implementation
        const mockCalendar: Calendar = {
          id: calendarId,
          name: 'Mock Calendar',
          owner: 'user@example.com',
          timeZone: 'UTC'
        };

        return Result.success(mockCalendar);
      } catch (error) {
        return Result.failure({
          type: 'network_error',
          cause: error as Error
        });
      }
    }
  };

  // Freeze service for immutability
  return Object.freeze(service);
};

/**
 * Event service implementation factory
 */
export const createEventService = (deps: Dependencies): EventService => {
  const service: EventService = {
    async *getEvents(calendarId: CalendarId, config: Office365Config): AsyncIterableService<Event> {
      try {
        const tokenResult = await deps.tokenManager.getAccessToken();
        if (tokenResult.isFailure()) {
          const error = tokenResult.match(
            () => null,
            (err: CalendarError) => err
          );
          yield Result.failure(error!) as ServiceResult<Event>;
          return;
        }

        deps.logger.debug('Fetching events', { 
          calendarId: calendarId.value,
          maxResults: config.eventsMaxResults 
        });

        // Mock implementation - would call Microsoft Graph API
        yield Result.success({
          type: 'normal',
          id: { value: 'event-1' } as EventId,
          calendarId,
          lastModified: { value: Date.now() } as Timestamp,
          subject: 'Mock Event',
          start: {
            timestamp: { value: Date.now() + 3600000 } as Timestamp,
            timeZone: 'UTC',
            toISOString: () => new Date(Date.now() + 3600000).toISOString(),
            toDate: () => new Date(Date.now() + 3600000)
          },
          end: {
            timestamp: { value: Date.now() + 7200000 } as Timestamp,
            timeZone: 'UTC',
            toISOString: () => new Date(Date.now() + 7200000).toISOString(),
            toDate: () => new Date(Date.now() + 7200000)
          },
          attendees: [],
          status: 'confirmed' as any,
          isAllDay: false
        } as Event);
      } catch (error) {
        yield Result.failure({
          type: 'network_error',
          cause: error as Error
        });
      }
    },

    async getEvent(eventId: EventId, calendarId: CalendarId, config: Office365Config): Promise<ServiceResult<Event>> {
      try {
        const tokenResult = await deps.tokenManager.getAccessToken();
        if (tokenResult.isFailure()) {
          return tokenResult.match(
            () => Result.success({} as Event),
            (err: CalendarError) => Result.failure(err)
          );
        }

        deps.logger.debug('Fetching event', { 
          eventId: eventId.value,
          calendarId: calendarId.value 
        });

        // Mock implementation
        return Result.success({
          type: 'normal',
          id: eventId,
          calendarId,
          lastModified: { value: Date.now() } as Timestamp,
          subject: 'Mock Event',
          start: {
            timestamp: { value: Date.now() + 3600000 } as Timestamp,
            timeZone: 'UTC',
            toISOString: () => new Date(Date.now() + 3600000).toISOString(),
            toDate: () => new Date(Date.now() + 3600000)
          },
          end: {
            timestamp: { value: Date.now() + 7200000 } as Timestamp,
            timeZone: 'UTC',
            toISOString: () => new Date(Date.now() + 7200000).toISOString(),
            toDate: () => new Date(Date.now() + 7200000)
          },
          attendees: [],
          status: 'confirmed' as any,
          isAllDay: false
        } as Event);
      } catch (error) {
        return Result.failure({
          type: 'network_error',
          cause: error as Error
        });
      }
    },

    async *getEventsInRange(
      calendarId: CalendarId, 
      start: Timestamp, 
      end: Timestamp, 
      config: Office365Config
    ): AsyncIterableService<Event> {
      // Delegate to getEvents for now - in real implementation would filter by date range
      yield* this.getEvents(calendarId, config);
    }
  };

  return Object.freeze(service);
};

/**
 * Higher-order function to add retry behavior (trait composition)
 */
export const withRetry = <T extends CalendarService | EventService>(
  service: T,
  retryConfig: RetryConfig
): T => {
  const enhancedService = {} as T;

  // Wrap each method with retry logic
  for (const [key, method] of Object.entries(service)) {
    if (typeof method === 'function') {
      (enhancedService as any)[key] = async (...args: any[]) => {
        let lastError: CalendarError | undefined;
        
        for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
          try {
            const result = await (method as any).apply(service, args);
            
            // For async iterables, wrap the iterator
            if (result && typeof result[Symbol.asyncIterator] === 'function') {
              return wrapAsyncIterableWithRetry(result, retryConfig, attempt);
            }
            
            // For regular results, check if retry is needed
            if (result && result.isFailure && result.isFailure()) {
              const error = result.match(
                () => null,
                (err: CalendarError) => err
              );
              
              if (error && retryConfig.shouldRetry(error) && attempt < retryConfig.maxAttempts) {
                lastError = error;
                await delay(retryConfig.backoffMs * attempt);
                continue;
              }
            }
            
            return result;
          } catch (error) {
            lastError = {
              type: 'network_error',
              cause: error as Error
            };
            
            if (attempt < retryConfig.maxAttempts) {
              await delay(retryConfig.backoffMs * attempt);
              continue;
            }
          }
        }
        
        // If we get here, all retries failed
        return Result.failure(lastError!);
      };
    }
  }

  return Object.freeze(enhancedService);
};

/**
 * Higher-order function to add rate limiting (trait composition)
 */
export const withRateLimit = <T extends CalendarService | EventService>(
  service: T,
  rateLimiter: RateLimiter
): T => {
  const enhancedService = {} as T;

  for (const [key, method] of Object.entries(service)) {
    if (typeof method === 'function') {
      (enhancedService as any)[key] = async (...args: any[]) => {
        await rateLimiter.acquire();
        
        try {
          const result = await (method as any).apply(service, args);
          
          // For async iterables, wrap with rate limiting
          if (result && typeof result[Symbol.asyncIterator] === 'function') {
            return wrapAsyncIterableWithRateLimit(result, rateLimiter);
          }
          
          return result;
        } finally {
          rateLimiter.release();
        }
      };
    }
  }

  return Object.freeze(enhancedService);
};

/**
 * Higher-order function to add logging (trait composition)
 */
export const withLogging = <T extends CalendarService | EventService>(
  service: T,
  logger: Logger
): T => {
  const enhancedService = {} as T;

  for (const [key, method] of Object.entries(service)) {
    if (typeof method === 'function') {
      (enhancedService as any)[key] = async (...args: any[]) => {
        const startTime = Date.now();
        logger.debug(`Calling ${key}`, { args: args.map(arg => typeof arg) });
        
        try {
          const result = await (method as any).apply(service, args);
          const duration = Date.now() - startTime;
          
          logger.info(`${key} completed`, { duration });
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error(`${key} failed`, error as Error, { duration });
          throw error;
        }
      };
    }
  }

  return Object.freeze(enhancedService);
};

/**
 * Higher-order function to add metrics collection
 */
export const withMetrics = <T extends CalendarService | EventService>(
  service: T,
  serviceName: string
): T => {
  const enhancedService = {} as T;

  for (const [key, method] of Object.entries(service)) {
    if (typeof method === 'function') {
      (enhancedService as any)[key] = async (...args: any[]) => {
        const startTime = Date.now();
        
        try {
          const result = await (method as any).apply(service, args);
          const duration = Date.now() - startTime;
          
          // In real implementation, would send metrics to monitoring system
          console.debug(`METRIC: ${serviceName}.${key}.success`, { duration });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          console.debug(`METRIC: ${serviceName}.${key}.error`, { duration });
          throw error;
        }
      };
    }
  }

  return Object.freeze(enhancedService);
};

/**
 * Compose multiple services into a pipeline
 */
export const composePipeline = (
  calendarService: CalendarService,
  eventService: EventService
) => {
  const pipeline = {
    async *processCalendarsAndEvents(config: Office365Config) {
      for await (const calendarResult of calendarService.getCalendars(config)) {
        if (calendarResult.isSuccess()) {
          const calendar = calendarResult.unwrap();
          
          for await (const eventResult of eventService.getEvents(calendar.id, config)) {
            yield { calendar, eventResult };
          }
        } else {
          yield { calendar: null, eventResult: calendarResult as any };
        }
      }
    }
  };

  return Object.freeze(pipeline);
};

/**
 * Dependency injection helper (functional style)
 */
export const inject = <T>(factory: (deps: Dependencies) => T) => {
  return (deps: Dependencies): T => {
    return factory(deps);
  };
};

// Helper functions

/**
 * Utility function to add delay for retry backoff
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Wrap async iterable with retry logic
 */
async function* wrapAsyncIterableWithRetry<T>(
  iterable: AsyncIterable<T>,
  retryConfig: RetryConfig,
  currentAttempt: number
): AsyncIterable<T> {
  try {
    for await (const item of iterable) {
      yield item;
    }
  } catch (error) {
    if (currentAttempt < retryConfig.maxAttempts) {
      await delay(retryConfig.backoffMs * currentAttempt);
      // In real implementation, would retry the iterable
    }
    throw error;
  }
}

/**
 * Wrap async iterable with rate limiting
 */
async function* wrapAsyncIterableWithRateLimit<T>(
  iterable: AsyncIterable<T>,
  rateLimiter: RateLimiter
): AsyncIterable<T> {
  for await (const item of iterable) {
    await rateLimiter.acquire();
    try {
      yield item;
    } finally {
      rateLimiter.release();
    }
  }
}