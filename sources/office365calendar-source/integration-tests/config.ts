/**
 * Integration Test Configuration
 * 
 * Production-grade test environment setup with type-safe configuration
 * and environment-based credential management.
 */

import { Office365CalendarConfig } from '../../src/models';
import { TenantId, CalendarId, asTenantId, asCalendarId } from '../../src/models';

/**
 * Safely parse JSON with fallback value, preventing potential security issues
 * from untrusted environment variable data.
 */
function safeJsonParse<T>(jsonString: string | undefined, fallback: T): T {
  if (!jsonString || jsonString.trim() === '') {
    return fallback;
  }
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn(`Failed to parse JSON from environment variable: ${error}`);
    return fallback;
  }
}

/**
 * Safely parse integer with fallback value, preventing potential security issues
 * and ensuring valid numeric values.
 */
function safeParseInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim() === '') {
    return fallback;
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || !isFinite(parsed)) {
    console.warn(`Invalid integer value from environment variable: ${value}, using fallback: ${fallback}`);
    return fallback;
  }
  
  return parsed;
}

/**
 * Integration test environment configuration.
 * 
 * Supports both controlled test environment and real Microsoft 365 tenant testing.
 * Credentials are loaded from environment variables for security.
 */
export interface IntegrationTestConfig extends Office365CalendarConfig {
  /** Test user email for validation */
  readonly testUserEmail: string;
  
  /** Known calendar IDs with predictable data */
  readonly knownCalendarIds: readonly CalendarId[];
  
  /** Expected event counts per calendar for validation */
  readonly expectedEventCounts: Readonly<Record<string, number>>;
  
  /** Calendar with large dataset for performance testing */
  readonly largeDatasetCalendarId: CalendarId;
  
  /** Maximum time to wait for operations (milliseconds) */
  readonly timeoutMs: number;
  
  /** Whether to run tests that modify data (create/delete events) */
  readonly enableDestructiveTests: boolean;
}

/**
 * Loads integration test configuration from environment variables.
 * 
 * @returns {IntegrationTestConfig | null} Configuration if available, null if missing required env vars
 * 
 * @example
 * ```typescript
 * const config = loadIntegrationConfig();
 * if (config) {
 *   // Run integration tests
 * } else {
 *   // Skip integration tests
 * }
 * ```
 */
export function loadIntegrationConfig(): IntegrationTestConfig | null {
  const requiredEnvVars = [
    'INTEGRATION_TENANT_ID',
    'INTEGRATION_CLIENT_ID', 
    'INTEGRATION_CLIENT_SECRET'
  ];

  // Check if all required environment variables are present
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.warn(`Missing required environment variables for integration tests: ${missingVars.join(', ')}`);
    return null;
  }

  try {
    const config: IntegrationTestConfig = {
      tenant_id: asTenantId(process.env.INTEGRATION_TENANT_ID!),
      client_id: process.env.INTEGRATION_CLIENT_ID!,
      client_secret: process.env.INTEGRATION_CLIENT_SECRET!,
      
      // Optional configuration with sensible defaults
      domain_wide_delegation: process.env.INTEGRATION_DOMAIN_WIDE === 'true',
      events_max_results: safeParseInt(process.env.INTEGRATION_EVENTS_MAX_RESULTS, 100),
      cutoff_days: safeParseInt(process.env.INTEGRATION_CUTOFF_DAYS, 30),
      
      // Test-specific configuration
      testUserEmail: process.env.INTEGRATION_TEST_USER_EMAIL || 'test@example.com',
      
      knownCalendarIds: (process.env.INTEGRATION_KNOWN_CALENDAR_IDS || '')
        .split(',')
        .filter(id => id.trim().length > 0)
        .map(id => asCalendarId(id.trim())),
      
      expectedEventCounts: safeJsonParse(process.env.INTEGRATION_EXPECTED_EVENT_COUNTS, {}),
      
      largeDatasetCalendarId: asCalendarId(
        process.env.INTEGRATION_LARGE_DATASET_CALENDAR_ID || 'large-calendar-id'
      ),
      
      timeoutMs: safeParseInt(process.env.INTEGRATION_TIMEOUT_MS, 30000),
      enableDestructiveTests: process.env.INTEGRATION_ENABLE_DESTRUCTIVE_TESTS === 'true'
    };

    return Object.freeze(config); // Immutable configuration
    
  } catch (error) {
    console.error('Failed to parse integration test configuration:', error);
    return null;
  }
}

/**
 * Creates a minimal configuration for basic connectivity testing.
 * 
 * @param config - Base integration configuration
 * @returns {Office365CalendarConfig} Minimal config for auth testing
 */
export function createMinimalConfig(config: IntegrationTestConfig): Office365CalendarConfig {
  return Object.freeze({
    tenant_id: config.tenant_id,
    client_id: config.client_id,
    client_secret: config.client_secret
  });
}

/**
 * Creates a configuration optimized for large dataset testing.
 * 
 * @param config - Base integration configuration  
 * @returns {Office365CalendarConfig} Config optimized for performance testing
 */
export function createPerformanceConfig(config: IntegrationTestConfig): Office365CalendarConfig {
  return Object.freeze({
    tenant_id: config.tenant_id,
    client_id: config.client_id,
    client_secret: config.client_secret,
    calendar_ids: [config.largeDatasetCalendarId],
    events_max_results: 500, // Larger batches for performance testing
    cutoff_days: 90
  });
}

/**
 * Environment variable template for setting up integration tests.
 * Copy this to your .env file and fill in the values.
 */
export const ENV_TEMPLATE = `
# Office 365 Calendar Integration Test Configuration
# Copy these to your .env file and fill in the actual values

# Required: Azure AD Application Credentials
INTEGRATION_TENANT_ID=your-tenant-id-here
INTEGRATION_CLIENT_ID=your-client-id-here  
INTEGRATION_CLIENT_SECRET=your-client-secret-here

# Optional: Test Configuration
INTEGRATION_DOMAIN_WIDE=false
INTEGRATION_EVENTS_MAX_RESULTS=100
INTEGRATION_CUTOFF_DAYS=30

# Test Data Configuration
INTEGRATION_TEST_USER_EMAIL=test@yourcompany.com
INTEGRATION_KNOWN_CALENDAR_IDS=calendar-id-1,calendar-id-2
INTEGRATION_EXPECTED_EVENT_COUNTS={"calendar-id-1":5,"calendar-id-2":10}
INTEGRATION_LARGE_DATASET_CALENDAR_ID=large-calendar-id

# Test Execution Configuration  
INTEGRATION_TIMEOUT_MS=30000
INTEGRATION_ENABLE_DESTRUCTIVE_TESTS=false
`.trim();

/**
 * Type guard to check if integration configuration is available.
 * 
 * @param config - Potential configuration object
 * @returns {boolean} True if config is valid for integration testing
 */
export function isIntegrationConfigAvailable(config: unknown): config is IntegrationTestConfig {
  return config !== null && 
         typeof config === 'object' && 
         'tenant_id' in config! && 
         'client_id' in config! && 
         'client_secret' in config!;
}