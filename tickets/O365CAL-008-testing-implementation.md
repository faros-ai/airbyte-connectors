# O365CAL-008: Comprehensive Testing Implementation

## User Story
As a developer, I want comprehensive test coverage for the Office 365 Calendar connector so that I can ensure reliability and catch regressions during development.

## Description
Implement unit tests, integration tests, and mock API responses to validate all connector functionality, following the same testing patterns as the Google Calendar connector.

## Acceptance Criteria
- [ ] Unit tests for all core components with high coverage
- [ ] Integration tests with mock Microsoft Graph API responses
- [ ] Connection validation tests for success/failure scenarios
- [ ] Stream tests for both full refresh and incremental sync modes
- [ ] Error handling and edge case tests
- [ ] Test structure mirrors Google Calendar connector tests

## Tasks
### Test Setup and Structure
- [ ] Copy test structure from `googlecalendar-source/test/`
- [ ] Create `test/index.test.ts` with main test suite
- [ ] Set up Jest configuration for Office 365 connector
- [ ] Import testing utilities from `faros-airbyte-testing-tools`
- [ ] Create mock configuration with test credentials

### Mock API Responses
- [ ] Create `test_files/` directory with mock data:
  - `config.json`: Valid test configuration
  - `invalid_config.json`: Invalid configuration for error testing
  - `calendars.json`: Mock Graph API calendar responses
  - `events.json`: Mock Graph API event responses
  - `full_configured_catalog.json`: Full refresh catalog
  - `incremental_configured_catalog.json`: Incremental catalog
  - `abnormal_state.json`: Test state for incremental sync
- [ ] Create mock Microsoft Graph API server responses
- [ ] Ensure mock data matches actual Graph API response format

### Connection Tests
- [ ] Test successful connection with valid credentials:
  - Valid client_id, client_secret, tenant_id
  - Successful OAuth2 token acquisition
  - Successful Graph API call
- [ ] Test connection failure scenarios:
  - Invalid client_id/client_secret
  - Invalid tenant_id
  - Network errors and timeouts
  - API permission errors
  - Rate limiting scenarios

### API Client Tests
- [ ] Test OAuth2 authentication flow
- [ ] Test pagination helper with mock responses
- [ ] Test API method implementations:
  - `getCalendars()` with various scenarios
  - `getEvents()` with filtering and pagination
  - `getEventsIncremental()` with delta queries
- [ ] Test error handling and retry logic
- [ ] Test rate limiting and backoff behavior

### Stream Tests - Calendars
- [ ] Test calendars stream in full refresh mode:
  - Mock calendar API responses
  - Verify field mapping from Graph API to schema
  - Test domain-wide delegation scenarios
  - Test calendar filtering by IDs
- [ ] Test permission error handling
- [ ] Test empty calendar list scenarios

### Stream Tests - Events
- [ ] Test events stream in full refresh mode:
  - Mock event API responses
  - Verify field mapping from Graph API to schema
  - Test stream slicing by calendar
  - Test cutoff_days filtering
  - Test events_max_results pagination
- [ ] Test incremental sync mode:
  - Mock delta query responses
  - Test state management per calendar
  - Test delta token persistence
  - Test deleted event handling (@removed annotations)
  - Test fallback to full refresh on expired tokens

### Integration Tests
- [ ] Test end-to-end sync scenarios:
  - Full refresh sync for both streams
  - Incremental sync with state persistence
  - Multi-calendar sync scenarios
  - Error recovery and retry scenarios
- [ ] Test configuration variations:
  - Domain-wide delegation enabled/disabled
  - Custom calendar_ids vs. default behavior
  - Different cutoff_days values
- [ ] Test state management across sync runs

### Error Handling Tests
- [ ] Test malformed API responses
- [ ] Test network failures and timeouts
- [ ] Test API rate limiting (429 responses)
- [ ] Test invalid delta tokens (410 responses)
- [ ] Test permission errors for specific calendars
- [ ] Test partial sync failures

### Performance Tests
- [ ] Test large calendar sets (if possible with mocks)
- [ ] Test pagination with many events
- [ ] Test incremental sync performance vs. full refresh
- [ ] Memory usage tests for large datasets

## Definition of Done
- [ ] All tests pass consistently
- [ ] Test coverage is high (>80% line coverage)
- [ ] Tests follow the same patterns as Google Calendar
- [ ] Mock data accurately represents Graph API responses
- [ ] Error scenarios are properly tested
- [ ] Integration tests validate end-to-end functionality
- [ ] Tests run efficiently in CI/CD pipeline
- [ ] Test documentation is clear and maintainable

## Dependencies
- O365CAL-007 (Main Source Implementation)

## Estimate
10 story points