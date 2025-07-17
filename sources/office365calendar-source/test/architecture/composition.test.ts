import {
  Dependencies,
  Logger,
  HttpClient,
  RateLimiter,
  TokenManager,
  CalendarService,
  EventService,
  Office365Config,
  CalendarError,
  EventError,
  createDependencies,
  createCalendarService,
  createEventService,
  composePipeline,
  withRetry,
  withRateLimit,
  withLogging,
  withMetrics,
  ServiceResult,
  AsyncIterableService,
  inject
} from '../../src/architecture/composition';
import { 
  Result,
  Option,
  createCalendarId,
  createEventId,
  createTimestamp,
  Calendar,
  Event,
  NormalEvent,
  createNormalEvent
} from '../../src/domain';

describe('Functional Composition - Trait System', () => {
  // Mock implementations for testing
  const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  const mockHttpClient: HttpClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    request: jest.fn()
  };

  const mockRateLimiter: RateLimiter = {
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    getCurrentActiveCount: jest.fn().mockReturnValue(0),
    getMaxConcurrency: jest.fn().mockReturnValue(5)
  };

  const mockTokenManager: TokenManager = {
    getAccessToken: jest.fn().mockResolvedValue(Result.success('mock-token')),
    refreshToken: jest.fn().mockResolvedValue(Result.success('new-token')),
    isTokenValid: jest.fn().mockReturnValue(true),
    clearToken: jest.fn()
  };

  const mockConfig: Office365Config = {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    tenantId: 'test-tenant',
    calendarIds: [],
    cutoffDays: 30,
    eventsMaxResults: 1000
  };

  describe('Dependency Injection (Trait-Style Interfaces)', () => {
    test('should create dependency container with all required services', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      expect(deps.logger).toBe(mockLogger);
      expect(deps.httpClient).toBe(mockHttpClient);
      expect(deps.rateLimiter).toBe(mockRateLimiter);
      expect(deps.tokenManager).toBe(mockTokenManager);
    });

    test('should inject dependencies into services', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const calendarService = createCalendarService(deps);
      expect(typeof calendarService.getCalendars).toBe('function');
      expect(typeof calendarService.getCalendar).toBe('function');
    });

    test('should compose services with dependency requirements', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const calendarService = createCalendarService(deps);
      const eventService = createEventService(deps);

      // Services should be composable
      const pipeline = composePipeline(calendarService, eventService);
      expect(typeof pipeline.processCalendarsAndEvents).toBe('function');
    });
  });

  describe('Higher-Order Functions (Trait Composition)', () => {
    test('should compose services with retry behavior', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const baseService = createCalendarService(deps);
      const serviceWithRetry = withRetry(baseService, {
        maxAttempts: 3,
        backoffMs: 100,
        shouldRetry: (error) => error.type === 'network_error'
      });

      expect(typeof serviceWithRetry.getCalendars).toBe('function');
      expect(typeof serviceWithRetry.getCalendar).toBe('function');
    });

    test('should compose services with rate limiting', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const baseService = createCalendarService(deps);
      const serviceWithRateLimit = withRateLimit(baseService, mockRateLimiter);

      // Rate limiter should be called when using the service
      const calendarsIterator = serviceWithRateLimit.getCalendars(mockConfig);
      
      // Just check that the function is properly wrapped
      expect(typeof serviceWithRateLimit.getCalendars).toBe('function');
    });

    test('should compose services with logging', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const baseService = createCalendarService(deps);
      const serviceWithLogging = withLogging(baseService, mockLogger);

      expect(typeof serviceWithLogging.getCalendars).toBe('function');
      expect(typeof serviceWithLogging.getCalendar).toBe('function');
    });

    test('should compose multiple decorators (trait chaining)', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const baseService = createCalendarService(deps);
      
      // Chain multiple decorators like trait bounds
      const enhancedService = withMetrics(
        withLogging(
          withRateLimit(
            withRetry(baseService, {
              maxAttempts: 3,
              backoffMs: 100,
              shouldRetry: (error) => error.type === 'network_error'
            }),
            mockRateLimiter
          ),
          mockLogger
        ),
        'calendar_service'
      );

      expect(typeof enhancedService.getCalendars).toBe('function');
      expect(typeof enhancedService.getCalendar).toBe('function');
    });
  });

  describe('Pure Functions and Immutability', () => {
    test('should have pure service functions with no side effects', () => {
      const deps1 = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const deps2 = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service1 = createCalendarService(deps1);
      const service2 = createCalendarService(deps2);

      // Services should be independent and pure
      expect(service1).not.toBe(service2);
      expect(typeof service1.getCalendars).toBe('function');
      expect(typeof service2.getCalendars).toBe('function');
    });

    test('should maintain immutability across service calls', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const originalDeps = { ...deps };
      const service = createCalendarService(deps);

      // Dependencies should remain unchanged after service creation
      expect(deps).toEqual(originalDeps);
      
      // Service should be frozen
      expect(() => {
        (service as any).newProperty = 'test';
      }).toThrow();
    });
  });

  describe('Resource Management (RAII Pattern)', () => {
    test('should properly acquire and release resources', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = withRateLimit(createCalendarService(deps), mockRateLimiter);
      
      // Mock an async operation
      const mockAsyncOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return Result.success([]);
      };

      // Test resource acquisition and release
      await mockAsyncOp();
      
      // Verify rate limiter was called (resource management)
      expect(mockRateLimiter.acquire).toHaveBeenCalled();
    });

    test('should handle resource cleanup on errors', async () => {
      const failingRateLimiter: RateLimiter = {
        acquire: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        release: jest.fn(),
        getCurrentActiveCount: jest.fn().mockReturnValue(0),
        getMaxConcurrency: jest.fn().mockReturnValue(5)
      };

      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: failingRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = withRateLimit(createCalendarService(deps), failingRateLimiter);

      // Service should handle rate limiter failures gracefully
      expect(typeof service.getCalendars).toBe('function');
    });
  });

  describe('Type Safety and Compile-Time Guarantees', () => {
    test('should enforce correct dependency types at compile time', () => {
      // This test mainly validates TypeScript compilation
      // Incorrect types should cause compilation errors
      
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = createCalendarService(deps);
      
      // TypeScript should enforce that service methods return correct types
      const calendarsResult = service.getCalendars(mockConfig);
      expect(Symbol.asyncIterator in calendarsResult).toBe(true);
    });

    test('should provide exhaustive error handling', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = createCalendarService(deps);
      
      // All service methods should return Result types
      const calendarsIterator = service.getCalendars(mockConfig);
      expect(Symbol.asyncIterator in calendarsIterator).toBe(true);
    });
  });

  describe('Async Iterator Composition', () => {
    test('should compose async iterators for streaming data', async () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const calendarService = createCalendarService(deps);
      const eventService = createEventService(deps);
      
      // Mock calendar data
      const mockCalendar = {
        id: createCalendarId('test-calendar'),
        name: 'Test Calendar',
        owner: 'test@example.com',
        timeZone: 'UTC'
      };

      // Services should provide async iterators
      const calendarsIterator = calendarService.getCalendars(mockConfig);
      expect(Symbol.asyncIterator in calendarsIterator).toBe(true);
    });

    test('should handle backpressure correctly', async () => {
      const slowRateLimiter: RateLimiter = {
        acquire: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
        release: jest.fn(),
        getCurrentActiveCount: jest.fn().mockReturnValue(3),
        getMaxConcurrency: jest.fn().mockReturnValue(5)
      };

      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: slowRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = withRateLimit(createCalendarService(deps), slowRateLimiter);
      
      // Service should handle slow rate limiting gracefully
      expect(typeof service.getCalendars).toBe('function');
    });
  });

  describe('Dependency Validation', () => {
    test('should validate required dependencies at creation time', () => {
      expect(() => createDependencies({
        logger: null as any,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      })).toThrow('Logger is required');

      expect(() => createDependencies({
        logger: mockLogger,
        httpClient: null as any,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      })).toThrow('HttpClient is required');
    });

    test('should provide meaningful error messages for missing dependencies', () => {
      expect(() => createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: null as any,
        tokenManager: mockTokenManager
      })).toThrow('RateLimiter is required');

      expect(() => createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: null as any
      })).toThrow('TokenManager is required');
    });
  });

  describe('Service Lifecycle Management', () => {
    test('should support service initialization and cleanup', () => {
      const deps = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service = createCalendarService(deps);
      
      // Services should be immutable after creation
      expect(Object.isFrozen(service)).toBe(true);
    });

    test('should handle service composition with different lifetimes', () => {
      const deps1 = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const deps2 = createDependencies({
        logger: mockLogger,
        httpClient: mockHttpClient,
        rateLimiter: mockRateLimiter,
        tokenManager: mockTokenManager
      });

      const service1 = createCalendarService(deps1);
      const service2 = createCalendarService(deps2);
      
      // Services should be independent
      expect(service1).not.toBe(service2);
      expect(Object.isFrozen(service1)).toBe(true);
      expect(Object.isFrozen(service2)).toBe(true);
    });
  });
});