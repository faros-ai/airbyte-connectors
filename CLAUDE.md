# Claude Development Guide - Office 365 Calendar Connector

## Overview
This document provides implementation guidance for creating the Office 365 Calendar connector using Test-Driven Development (TDD) principles with Rust-level code quality standards.

## Test-Driven Development (TDD) Approach

### TDD Philosophy
- **Red-Green-Refactor Cycle**: Write failing tests first, implement minimal code to pass, then refactor
- **Tests as Specifications**: Tests define the exact behavior and API contracts
- **Zero Tolerance Policy**: No production code without corresponding tests
- **Coverage Excellence**: Aim for 95%+ line coverage and 100% branch coverage for error paths

### TDD Implementation Order
1. **Write Tests First**: Define expected behavior through comprehensive test cases
2. **Run Tests (Red)**: Verify tests fail appropriately
3. **Implement Minimal Code (Green)**: Write just enough code to make tests pass
4. **Refactor**: Improve code quality while maintaining test passing status
5. **Repeat**: Continue cycle for each feature

## Project Structure with TDD

### Source and Test Co-location
```
sources/office365calendar-source/
├── src/
│   ├── index.ts                    # Main source (with tests)
│   ├── office365calendar.ts        # API client (with tests)
│   ├── models.ts                   # Type definitions (with tests)
│   └── streams/
│       ├── calendars.ts            # Calendars stream (with tests)
│       └── events.ts               # Events stream (with tests)
├── test/
│   ├── index.test.ts               # Source integration tests
│   ├── office365calendar.test.ts   # API client unit tests
│   ├── models.test.ts              # Type validation tests
│   ├── streams/
│   │   ├── calendars.test.ts       # Calendars stream tests
│   │   └── events.test.ts          # Events stream tests
│   ├── test_files/                 # Mock data and fixtures
│   └── utils/                      # Test utilities and helpers
└── resources/
    ├── spec.json                   # Configuration schema
    └── schemas/                    # Stream schemas
```

## Implementation Guidelines

### Authentication & Configuration (TDD)

#### Required Tests Before Implementation:
1. **Configuration Validation Tests**:
   ```typescript
   describe('Office365CalendarConfig', () => {
     test('validates required fields: client_id, client_secret, tenant_id');
     test('accepts optional fields: calendar_ids, cutoff_days, events_max_results');
     test('rejects invalid tenant_id format');
     test('rejects empty client_secret');
   });
   ```

2. **OAuth2 Authentication Tests**:
   ```typescript
   describe('OAuth2 Authentication', () => {
     test('successfully obtains access token with valid credentials');
     test('handles invalid client_id/client_secret gracefully');
     test('retries on network failures with exponential backoff');
     test('caches valid tokens and reuses them');
   });
   ```

### API Client Implementation (TDD)

#### Required Tests Before Implementation:
1. **Connection Tests**:
   ```typescript
   describe('Office365Calendar.checkConnection', () => {
     test('validates connection with simple API call');
     test('returns descriptive error for auth failures');
     test('handles rate limiting (429) responses');
     test('times out gracefully on network issues');
   });
   ```

2. **API Method Tests**:
   ```typescript
   describe('API Methods', () => {
     test('getCalendars() returns properly typed calendar objects');
     test('getEvents() applies cutoff_days filtering correctly');
     test('getEventsIncremental() handles delta queries');
     test('pagination works with @odata.nextLink');
   });
   ```

### Stream Implementation (TDD)

#### Required Tests Before Implementation:
1. **Calendars Stream Tests**:
   ```typescript
   describe('CalendarsStream', () => {
     test('full refresh returns all accessible calendars');
     test('respects calendar_ids configuration filter');
     test('handles domain-wide delegation scenarios');
     test('maps Office 365 fields to Google Calendar schema');
     test('gracefully skips inaccessible calendars');
   });
   ```

2. **Events Stream Tests**:
   ```typescript
   describe('EventsStream', () => {
     test('full refresh fetches events within cutoff_days');
     test('incremental sync uses delta queries correctly');
     test('handles deleted events (@removed annotations)');
     test('stream slicing works per calendar ID');
     test('falls back to full refresh on expired delta tokens');
     test('respects events_max_results pagination');
   });
   ```

## Code Quality Standards

### TypeScript Strictness (Rust-Level)
- **Strict mode enabled**: `"strict": true`
- **Explicit return types**: Required for all public methods
- **No implicit any**: Zero tolerance for `any` types
- **Null safety**: Proper handling of undefined/null values
- **Exhaustive error handling**: Every API call wrapped in try-catch

### Testing Standards
- **Test Coverage**: Minimum 95% line coverage, 100% branch coverage for error paths
- **Test Organization**: One test file per source file
- **Mock Strategy**: Comprehensive mocking of external dependencies
- **Test Data**: Realistic mock responses matching actual Microsoft Graph API
- **Error Scenarios**: Every error path tested with specific assertions

## TDD Workflow Per Ticket

### Phase 1: Write Tests (Red)
1. **Create test file** for the component
2. **Write failing tests** that define expected behavior
3. **Include edge cases** and error scenarios
4. **Run tests** to verify they fail appropriately
5. **Commit test-only changes** with `[TDD] Add tests for [component]`

### Phase 2: Implement Code (Green)
1. **Write minimal implementation** to make tests pass
2. **Avoid over-engineering** - just enough to pass tests
3. **Run tests frequently** to ensure progress
4. **Commit working implementation** with `[TDD] Implement [component]`

### Phase 3: Refactor (Refactor)
1. **Improve code quality** while maintaining test coverage
2. **Add type safety** and error handling
3. **Optimize performance** if needed
4. **Run full test suite** to ensure no regressions
5. **Commit refactored code** with `[TDD] Refactor [component]`

## Testing Tools and Utilities

### Required Testing Dependencies
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "jest-extended": "^4.0.2",
    "faros-airbyte-testing-tools": "*"
  }
}
```

### Mock Data Management
- **Realistic API responses**: Use actual Microsoft Graph API response structure
- **Edge case data**: Include malformed, empty, and error responses
- **Version consistency**: Mock data should match API version being used
- **Test isolation**: Each test should have independent mock data

### Test Utilities
```typescript
// Test helper for creating mock Graph client
export function createMockGraphClient(responses: MockResponses): GraphClient;

// Test helper for validating schema compliance
export function validateSchemaCompliance(data: any, schemaPath: string): void;

// Test helper for creating test configurations
export function createTestConfig(overrides?: Partial<Config>): Config;
```

## Definition of Done (Per Ticket)

### Code Quality Gates
- [ ] **All tests pass** (`npm test`)
- [ ] **Coverage targets met** (95%+ line, 100% error branch)
- [ ] **Linting clean** (`npm run lint`)
- [ ] **TypeScript strict compilation** (zero warnings)
- [ ] **No console.log statements** in production code
- [ ] **Proper error handling** for all API calls

### TDD Compliance
- [ ] **Tests written first** before implementation
- [ ] **Red-Green-Refactor cycle** followed
- [ ] **Edge cases covered** in test suite
- [ ] **Mock data realistic** and comprehensive
- [ ] **Test documentation** clear and maintainable

### Documentation Requirements
- [ ] **API contracts documented** through test specifications
- [ ] **Error scenarios documented** in test descriptions
- [ ] **Configuration options tested** with examples
- [ ] **Schema mappings validated** through tests

## Performance and Reliability

### Performance Testing
- **Large dataset handling**: Test with 1000+ calendars/events
- **Memory usage**: Monitor memory consumption during large syncs
- **API rate limiting**: Test behavior under rate limit conditions
- **Concurrent operations**: Test multi-calendar sync scenarios

### Reliability Testing
- **Network failures**: Test connection drops and timeouts
- **API errors**: Test handling of various HTTP error codes
- **Data corruption**: Test malformed API response handling
- **State recovery**: Test incremental sync state persistence

## Security Considerations

### Authentication Security
- **Token management**: Secure storage and refresh of access tokens
- **Credential validation**: Proper validation of client credentials
- **Error messages**: No credential exposure in error messages
- **Logging**: No sensitive data in log outputs

### Data Privacy
- **Calendar filtering**: Respect privacy settings on calendars
- **Attendee information**: Handle PII appropriately
- **Event content**: Filter sensitive meeting content if needed
- **Compliance**: GDPR and enterprise privacy requirements

This TDD approach ensures that every line of code is purposeful, tested, and reliable, achieving the Rust-level quality standards expected for production systems.