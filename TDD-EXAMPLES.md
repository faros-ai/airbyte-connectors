# Test-Driven Development Examples for Office 365 Calendar Connector

## TDD Philosophy for This Project

**Rust-Level Quality Standards:**
- Tests define the API contracts and expected behavior
- No production code without corresponding tests
- 95%+ line coverage, 100% branch coverage for error paths
- Red-Green-Refactor cycle religiously followed

## Example 1: Configuration Validation (O365CAL-002)

### 🔴 RED Phase: Write Failing Tests First

```typescript
// test/models.test.ts
import { validateOffice365CalendarConfig, Office365CalendarConfig } from '../src/models';
import { VError } from 'verror';

describe('Office365CalendarConfig Validation', () => {
  test('should accept valid configuration', () => {
    const config: Office365CalendarConfig = {
      client_id: 'valid-client-id',
      client_secret: 'valid-client-secret',
      tenant_id: 'valid-tenant-id'
    };
    
    expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
  });

  test('should reject missing client_id', () => {
    const config = {
      client_secret: 'valid-client-secret',
      tenant_id: 'valid-tenant-id'
    } as Office365CalendarConfig;
    
    expect(() => validateOffice365CalendarConfig(config))
      .toThrow(VError);
    expect(() => validateOffice365CalendarConfig(config))
      .toThrow('client_id must not be an empty string');
  });

  test('should reject empty client_secret', () => {
    const config: Office365CalendarConfig = {
      client_id: 'valid-client-id',
      client_secret: '',
      tenant_id: 'valid-tenant-id'
    };
    
    expect(() => validateOffice365CalendarConfig(config))
      .toThrow('client_secret must not be an empty string');
  });

  test('should reject invalid tenant_id format', () => {
    const config: Office365CalendarConfig = {
      client_id: 'valid-client-id',
      client_secret: 'valid-client-secret',
      tenant_id: 'invalid-format'
    };
    
    expect(() => validateOffice365CalendarConfig(config))
      .toThrow('tenant_id must be a valid GUID or domain name');
  });

  test('should accept optional calendar_ids array', () => {
    const config: Office365CalendarConfig = {
      client_id: 'valid-client-id',
      client_secret: 'valid-client-secret',
      tenant_id: 'valid-tenant-id',
      calendar_ids: ['cal1', 'cal2']
    };
    
    expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
  });

  test('should validate events_max_results range', () => {
    const invalidConfig: Office365CalendarConfig = {
      client_id: 'valid-client-id',
      client_secret: 'valid-client-secret',
      tenant_id: 'valid-tenant-id',
      events_max_results: 3000 // Too high
    };
    
    expect(() => validateOffice365CalendarConfig(invalidConfig))
      .toThrow('events_max_results must be between 1 and 2500');
  });
});
```

**At this point:**
- Run `npm test` → Tests FAIL (as expected)
- This defines exactly what our validation function should do
- Error messages are specified upfront

### 🟢 GREEN Phase: Write Minimal Implementation

```typescript
// src/models.ts
import { VError } from 'verror';

export interface Office365CalendarConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly tenant_id: string;
  readonly calendar_ids?: string[];
  readonly domain_wide_delegation?: boolean;
  readonly events_max_results?: number;
  readonly cutoff_days?: number;
}

export function validateOffice365CalendarConfig(config: Office365CalendarConfig): void {
  if (!config.client_id || config.client_id.trim() === '') {
    throw new VError('client_id must not be an empty string');
  }

  if (!config.client_secret || config.client_secret.trim() === '') {
    throw new VError('client_secret must not be an empty string');
  }

  if (!config.tenant_id || config.tenant_id.trim() === '') {
    throw new VError('tenant_id must not be an empty string');
  }

  // Basic tenant_id format validation (GUID or domain)
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!guidRegex.test(config.tenant_id) && !domainRegex.test(config.tenant_id)) {
    throw new VError('tenant_id must be a valid GUID or domain name');
  }

  if (config.events_max_results !== undefined) {
    if (config.events_max_results < 1 || config.events_max_results > 2500) {
      throw new VError('events_max_results must be between 1 and 2500');
    }
  }

  if (config.cutoff_days !== undefined && config.cutoff_days < 1) {
    throw new VError('cutoff_days must be at least 1');
  }
}
```

**At this point:**
- Run `npm test` → Tests PASS
- Implementation is minimal but correct
- Coverage should be high since tests drive the implementation

### 🔵 REFACTOR Phase: Improve Code Quality

```typescript
// src/models.ts (refactored)
import { VError } from 'verror';

export interface Office365CalendarConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly tenant_id: string;
  readonly calendar_ids?: string[];
  readonly domain_wide_delegation?: boolean;
  readonly events_max_results?: number;
  readonly cutoff_days?: number;
}

// Constants for validation
const EVENTS_MAX_RESULTS_MIN = 1;
const EVENTS_MAX_RESULTS_MAX = 2500;
const CUTOFF_DAYS_MIN = 1;

// Validation patterns
const TENANT_ID_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_ID_DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Validates Office 365 Calendar connector configuration
 * @param config Configuration object to validate
 * @throws VError if configuration is invalid
 */
export function validateOffice365CalendarConfig(config: Office365CalendarConfig): void {
  validateRequiredStringField(config.client_id, 'client_id');
  validateRequiredStringField(config.client_secret, 'client_secret');
  validateTenantId(config.tenant_id);
  validateOptionalEventsMaxResults(config.events_max_results);
  validateOptionalCutoffDays(config.cutoff_days);
}

function validateRequiredStringField(value: string, fieldName: string): void {
  if (!value || value.trim() === '') {
    throw new VError(`${fieldName} must not be an empty string`);
  }
}

function validateTenantId(tenantId: string): void {
  validateRequiredStringField(tenantId, 'tenant_id');
  
  if (!TENANT_ID_GUID_PATTERN.test(tenantId) && !TENANT_ID_DOMAIN_PATTERN.test(tenantId)) {
    throw new VError('tenant_id must be a valid GUID or domain name');
  }
}

function validateOptionalEventsMaxResults(eventsMaxResults?: number): void {
  if (eventsMaxResults !== undefined) {
    if (eventsMaxResults < EVENTS_MAX_RESULTS_MIN || eventsMaxResults > EVENTS_MAX_RESULTS_MAX) {
      throw new VError(`events_max_results must be between ${EVENTS_MAX_RESULTS_MIN} and ${EVENTS_MAX_RESULTS_MAX}`);
    }
  }
}

function validateOptionalCutoffDays(cutoffDays?: number): void {
  if (cutoffDays !== undefined && cutoffDays < CUTOFF_DAYS_MIN) {
    throw new VError(`cutoff_days must be at least ${CUTOFF_DAYS_MIN}`);
  }
}
```

**After refactoring:**
- Run `npm test` → All tests still PASS
- Code is more maintainable and readable
- No functionality changed, just improved structure

## Example 2: API Client Authentication (O365CAL-003)

### 🔴 RED Phase: Write Failing Tests First

```typescript
// test/office365calendar.test.ts
import { Office365Calendar, Office365CalendarConfig } from '../src/office365calendar';
import { VError } from 'verror';
import axios from 'axios';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Office365Calendar Authentication', () => {
  const validConfig: Office365CalendarConfig = {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    tenant_id: 'test-tenant-id'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton between tests
    (Office365Calendar as any).office365Calendar = null;
  });

  test('should create singleton instance with valid config', async () => {
    // Mock successful token response
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'mock-access-token' }
    });
    mockedAxios.create.mockReturnValueOnce({} as any);

    const instance = await Office365Calendar.instance(validConfig, mockLogger);
    const instance2 = await Office365Calendar.instance(validConfig, mockLogger);
    
    expect(instance).toBe(instance2); // Should be same singleton
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token',
      expect.any(URLSearchParams)
    );
  });

  test('should throw VError on missing client_id', async () => {
    const invalidConfig = { ...validConfig, client_id: '' };
    
    await expect(Office365Calendar.instance(invalidConfig, mockLogger))
      .rejects.toThrow(VError);
    await expect(Office365Calendar.instance(invalidConfig, mockLogger))
      .rejects.toThrow('client_id must not be an empty string');
  });

  test('should handle OAuth2 authentication failures', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 401, data: { error: 'invalid_client' } }
    });

    await expect(Office365Calendar.instance(validConfig, mockLogger))
      .rejects.toThrow(VError);
    await expect(Office365Calendar.instance(validConfig, mockLogger))
      .rejects.toThrow('Authentication failed');
  });

  test('should validate connection with simple API call', async () => {
    // Mock successful auth and API call
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'mock-access-token' }
    });
    
    const mockHttpClient = {
      get: jest.fn().mockResolvedValueOnce({ data: { value: [] } })
    };
    mockedAxios.create.mockReturnValueOnce(mockHttpClient as any);

    const instance = await Office365Calendar.instance(validConfig, mockLogger);
    await expect(instance.checkConnection()).resolves.not.toThrow();
    
    expect(mockHttpClient.get).toHaveBeenCalledWith('/me/calendars', expect.any(Object));
  });
});
```

### 🟢 GREEN Phase: Implementation

```typescript
// src/office365calendar.ts
import axios, { AxiosInstance } from 'axios';
import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';
import { validateOffice365CalendarConfig, Office365CalendarConfig } from './models';

const DEFAULT_VERSION = 'v1.0';
const AUTH_URL = 'https://login.microsoftonline.com';

export class Office365Calendar {
  private static office365Calendar: Office365Calendar | null = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: Office365CalendarConfig,
    logger: AirbyteLogger
  ): Promise<Office365Calendar> {
    if (Office365Calendar.office365Calendar) {
      return Office365Calendar.office365Calendar;
    }

    // Validate configuration first
    validateOffice365CalendarConfig(config);

    try {
      const accessToken = await this.getAccessToken(config);
      const httpClient = axios.create({
        baseURL: `https://graph.microsoft.com/${DEFAULT_VERSION}`,
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      });

      Office365Calendar.office365Calendar = new Office365Calendar(httpClient, logger);
      return Office365Calendar.office365Calendar;
    } catch (error) {
      throw new VError(error, 'Failed to create Office365Calendar instance');
    }
  }

  private static async getAccessToken(config: Office365CalendarConfig): Promise<string> {
    const data = new URLSearchParams({
      client_id: config.client_id,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: config.client_secret,
      grant_type: 'client_credentials',
    });

    try {
      const response = await axios.post(
        `${AUTH_URL}/${config.tenant_id}/oauth2/v2.0/token`,
        data,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );
      return response.data.access_token;
    } catch (error) {
      throw new VError(error, 'Authentication failed');
    }
  }

  async checkConnection(): Promise<void> {
    try {
      await this.httpClient.get('/me/calendars', { params: { $top: 1 } });
    } catch (error) {
      throw new VError(error, 'Connection check failed');
    }
  }
}
```

## Key TDD Principles Demonstrated

### 1. **Tests Define Behavior**
- Tests specify exact error messages
- Tests define function signatures and return types
- Tests document expected edge cases

### 2. **Fail Fast, Fail Clearly**
- Run tests after writing them to ensure they fail
- Failure messages guide implementation
- Red phase validates test correctness

### 3. **Minimal Implementation**
- Write just enough code to make tests pass
- Avoid over-engineering in green phase
- Refactor only after tests pass

### 4. **Comprehensive Coverage**
- Happy path AND error scenarios
- Edge cases and boundary conditions
- Network failures and external dependencies

### 5. **Rust-Level Quality**
- Explicit error types (VError)
- Comprehensive input validation
- No implicit behavior or assumptions

## Testing Commands

```bash
# Run tests in watch mode during development
npm run watch

# Run tests with coverage
npm run test-cov

# Run specific test file
npm test -- --testPathPattern=models.test.ts

# Run tests in verbose mode
npm test -- --verbose

# Run tests and update snapshots
npm test -- --updateSnapshot
```

## Coverage Requirements

**Minimum thresholds (enforced by CI):**
- **Lines**: 95%
- **Branches**: 100% (for error handling)
- **Functions**: 100%
- **Statements**: 95%

Every line of production code must have a corresponding test that validates its behavior. This ensures that our Office 365 Calendar connector meets the same quality standards as Rust systems programming.