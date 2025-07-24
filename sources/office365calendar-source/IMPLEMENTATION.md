# Office 365 Calendar Connector Implementation Checklist (TDD Approach)

## ⚠️ CRITICAL: Test-Driven Development (TDD) Requirements

**Every phase must follow strict TDD principles:**
1. **🔴 RED**: Write failing tests first that define expected behavior
2. **🟢 GREEN**: Implement minimal code to make tests pass
3. **🔵 REFACTOR**: Improve code quality while maintaining test coverage

**Quality Gates Per Phase:**
- ✅ **95%+ line coverage** for all production code
- ✅ **100% branch coverage** for error handling paths
- ✅ **All tests pass** before moving to next phase
- ✅ **TypeScript strict mode** with zero warnings
- ✅ **ESLint clean** with no rule violations

---

## Phase 1: Project Setup and Structure

### 1.1 Create Project Directory Structure
- [ ] Create directory: `sources/office365calendar-source/`
- [ ] Copy directory structure from `sources/googlecalendar-source/`
- [ ] Create subdirectories:
  - [ ] `src/`
  - [ ] `src/streams/`
  - [ ] `resources/`
  - [ ] `resources/schemas/`
  - [ ] `test/`

### 1.2 Initialize Package Configuration
- [ ] Copy `package.json` from `googlecalendar-source`
- [ ] Update package name to `"office365calendar-source"`
- [ ] Update keywords: replace "google", "googlecalendar", "gcal" with "microsoft", "office365", "o365"
- [ ] Update dependencies:
  - [ ] Remove: `"googleapis": "^108.0.0"`
  - [ ] Add: `"@azure/msal-node": "^2.0.0"`
  - [ ] Add: `"@microsoft/microsoft-graph-client": "^3.0.0"`
  - [ ] Keep: `"faros-airbyte-cdk": "*"` and `"verror": "^1.10.1"`

### 1.3 TypeScript Configuration
- [ ] Copy `tsconfig.json` from `googlecalendar-source`
- [ ] Copy `test/tsconfig.json` from `googlecalendar-source`

## Phase 2: Configuration and Models (TDD Required)

### 🔴 2.1 Write Configuration Tests FIRST
- [ ] Create `test/models.test.ts` with failing tests:
  - [ ] `validateOffice365CalendarConfig()` with required fields
  - [ ] `validateOffice365CalendarConfig()` rejects invalid tenant_id format
  - [ ] `validateOffice365CalendarConfig()` accepts optional fields
  - [ ] `validateOffice365CalendarConfig()` handles missing client_secret
- [ ] Create `test/resources/spec.json` validation tests
- [ ] Run tests to verify they fail appropriately

### 🟢 2.2 Implement Configuration (Make Tests Pass)
- [ ] Create `resources/spec.json` based on Google Calendar spec:
  - [ ] Update title: `"Office 365 Calendar Spec"`
  - [ ] Replace required fields:
    - [ ] Remove: `"client_email"`, `"private_key"`
    - [ ] Add: `"client_id"`, `"client_secret"`, `"tenant_id"`
  - [ ] Keep optional fields: `"calendar_ids"`, `"domain_wide_delegation"`, `"events_max_results"`, `"cutoff_days"`
  - [ ] Update descriptions for Microsoft Graph API context
  - [ ] Update domain_wide_delegation description for Microsoft 365 Application permissions

### 🟢 2.3 Define TypeScript Models (Make Tests Pass)
- [ ] Create `src/models.ts` with interfaces:
  - [ ] `Office365CalendarConfig` interface (mirroring `GoogleCalendarConfig`)
  - [ ] `Calendar` interface for Graph API calendar objects
  - [ ] `Event` interface for Graph API event objects
  - [ ] `DeltaResponse` interface for Graph API delta queries
  - [ ] Configuration validation functions

### 🟢 2.4 Create JSON Schemas (Make Tests Pass)
- [ ] Copy `resources/schemas/calendars.json` from Google Calendar
- [ ] Copy `resources/schemas/events.json` from Google Calendar
- [ ] Update field mappings to match Office 365 API responses:
  - [ ] Map `subject` to `summary` in events schema
  - [ ] Update attendee structure for Graph API format
  - [ ] Adjust recurrence pattern structure

### 🔵 2.5 Refactor Configuration (Maintain Test Coverage)
- [ ] Verify all tests pass with 95%+ coverage
- [ ] Improve type safety and error messages
- [ ] Add JSDoc documentation
- [ ] Run `npm run test-cov` to validate coverage

## Phase 3: API Client Implementation (TDD Required)

### 🔴 3.1 Write Authentication Tests FIRST
- [ ] Create `test/office365calendar.test.ts` with failing tests:
  - [ ] `Office365Calendar.instance()` creates singleton with valid config
  - [ ] `Office365Calendar.instance()` throws on missing client_id
  - [ ] `Office365Calendar.instance()` throws on invalid tenant_id format
  - [ ] `getAccessToken()` returns valid bearer token
  - [ ] `getAccessToken()` handles auth failures gracefully
  - [ ] `checkConnection()` validates API connectivity
- [ ] Run tests to verify they fail appropriately

### 🟢 3.2 Implement Authentication (Make Tests Pass)
- [ ] Create `src/office365calendar.ts` following `azureactivedirectory.ts` pattern:
  - [ ] Implement singleton pattern for API client
  - [ ] Add OAuth2 client credentials flow:
    - [ ] Token endpoint: `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token`
    - [ ] Scope: `https://graph.microsoft.com/.default`
  - [ ] Create axios instance with Bearer token
  - [ ] Base URL: `https://graph.microsoft.com/v1.0`

### 🔴 3.3 Write API Method Tests FIRST
- [ ] Add tests to `test/office365calendar.test.ts`:
  - [ ] `getCalendars()` returns properly typed calendar objects
  - [ ] `getCalendars()` handles domain-wide delegation scenarios
  - [ ] `getEvents()` applies cutoff_days filtering correctly
  - [ ] `getEvents()` respects events_max_results pagination
  - [ ] `getEventsIncremental()` handles delta queries
  - [ ] `getEventsIncremental()` processes @removed annotations
  - [ ] All methods handle rate limiting (429) responses
  - [ ] All methods handle network failures gracefully
- [ ] Run tests to verify they fail appropriately

### 🟢 3.4 Implement API Methods (Make Tests Pass)
- [ ] Implement `checkConnection()` method (test with simple calendars call)
- [ ] Implement `getCalendars()` method:
  - [ ] Use `/me/calendars` endpoint for single user
  - [ ] Use `/users/{userId}/calendars` for domain-wide delegation
  - [ ] Handle pagination with `@odata.nextLink`
- [ ] Implement `getEvents(calendarId)` method:
  - [ ] Use `/calendars/{calendarId}/events` endpoint
  - [ ] Apply `cutoff_days` filter with `$filter=start/dateTime ge '{date}'`
  - [ ] Handle pagination and `events_max_results`
- [ ] Implement `getEventsIncremental(calendarId, deltaLink)` method:
  - [ ] Use `/calendars/{calendarId}/events/delta` endpoint
  - [ ] Handle `@odata.deltaLink` for next sync
  - [ ] Process `@removed` annotations for deleted events

### 🔴 3.5 Write Error Handling Tests FIRST
- [ ] Add error handling tests to `test/office365calendar.test.ts`:
  - [ ] Generic pagination helper handles @odata.nextLink correctly
  - [ ] Retry logic with exponential backoff for 429 responses
  - [ ] Graph API error mapping to Airbyte error format
  - [ ] Network timeout and connection error handling
- [ ] Run tests to verify they fail appropriately

### 🟢 3.6 Implement Error Handling (Make Tests Pass)
- [ ] Implement generic pagination helper (following Azure AD pattern)
- [ ] Add retry logic for rate limiting (429 responses)
- [ ] Handle Graph API error responses
- [ ] Map Office 365 errors to Airbyte error format

### 🔵 3.7 Refactor API Client (Maintain Test Coverage)
- [ ] Verify all tests pass with 95%+ coverage
- [ ] Optimize performance and memory usage
- [ ] Add comprehensive error logging
- [ ] Run `npm run test-cov` to validate coverage

## Phase 4: Stream Implementation

### 4.1 Calendars Stream
- [ ] Create `src/streams/calendars.ts`:
  - [ ] Extend `AirbyteStreamBase`
  - [ ] Set name: `"calendars"`
  - [ ] Primary key: `["id"]`
  - [ ] Supported sync modes: `[SyncMode.full_refresh]`
  - [ ] Implement `readRecords()` using `getCalendars()`
  - [ ] Handle domain-wide delegation logic

### 4.2 Events Stream
- [ ] Create `src/streams/events.ts`:
  - [ ] Extend `AirbyteStreamBase`
  - [ ] Set name: `"events"`
  - [ ] Primary key: `["id"]`
  - [ ] Supported sync modes: `[SyncMode.full_refresh, SyncMode.incremental]`
  - [ ] Cursor field: `"nextSyncToken"`
  - [ ] Implement stream slicing by calendar ID
  - [ ] Implement `readRecords()` with incremental logic:
    - [ ] Check for existing state/delta link
    - [ ] Use `getEventsIncremental()` if delta link exists
    - [ ] Fall back to `getEvents()` for full refresh
  - [ ] Handle 410 "Gone" errors (invalid delta tokens)

### 4.3 Stream Utilities
- [ ] Create `src/streams/index.ts` exporting both streams
- [ ] Add field mapping utilities to convert Office 365 to Google Calendar format:
  - [ ] `subject` → `summary`
  - [ ] Convert attendee structures
  - [ ] Map event status values
  - [ ] Handle recurrence patterns

## Phase 5: Main Source Implementation

### 5.1 Source Class
- [ ] Create `src/index.ts`:
  - [ ] Implement `Office365CalendarSource` extending `AirbyteSourceBase`
  - [ ] Set type: `"office365-calendar"`
  - [ ] Implement `spec()` method returning `resources/spec.json`
  - [ ] Implement `checkConnection()` using API client
  - [ ] Implement `streams()` method returning calendars and events streams
  - [ ] Add `onBeforeRead()` for stream filtering if needed

### 5.2 Entry Point
- [ ] Add `mainCommand()` function for CLI entry point
- [ ] Export all necessary classes and types

## Phase 6: Integration Testing (TDD Required)

### 🔴 6.1 Write Integration Tests FIRST
- [ ] Create `test/index.test.ts` with comprehensive failing tests:
  - [ ] Source spec validation matches expected schema
  - [ ] Connection checking with valid/invalid credentials
  - [ ] Stream enumeration returns calendars and events streams
  - [ ] End-to-end full refresh sync scenarios
  - [ ] End-to-end incremental sync scenarios
  - [ ] Error recovery and retry scenarios
  - [ ] Domain-wide delegation integration scenarios

### 🔴 6.2 Write Mock Data and Test Utilities
- [ ] Create comprehensive `test/test_files/` mock data:
  - [ ] `config.json` - Valid test configuration
  - [ ] `invalid_config.json` - Invalid configurations for error testing
  - [ ] `calendars.json` - Mock Graph API calendar responses
  - [ ] `events.json` - Mock Graph API event responses
  - [ ] `delta_events.json` - Mock delta query responses
  - [ ] `full_configured_catalog.json` - Full refresh catalog
  - [ ] `incremental_configured_catalog.json` - Incremental catalog
  - [ ] `abnormal_state.json` - Test state for incremental sync
- [ ] Create test utilities following Google Calendar patterns:
  - [ ] Mock Graph API client factory
  - [ ] Test data loading helpers
  - [ ] Stream testing utilities

### 🟢 6.3 Make Integration Tests Pass
- [ ] Implement missing source integration components
- [ ] Ensure all mock data matches actual API response structure
- [ ] Verify stream integration with source class
- [ ] Implement proper error handling for all test scenarios

### 🔵 6.4 Refactor Integration Layer
- [ ] Verify all integration tests pass with full coverage
- [ ] Optimize integration performance
- [ ] Add comprehensive integration logging
- [ ] Run `npm run test-cov` to validate 95%+ coverage

**Note: Individual stream and API client tests are written in their respective phases above. This phase focuses on end-to-end integration testing.**

## Phase 7: Documentation and Finalization

### 7.1 Documentation
- [ ] Create/update `README.md`:
  - [ ] Installation instructions
  - [ ] Configuration guide for Microsoft Graph API
  - [ ] Required permissions documentation
  - [ ] Domain-wide delegation setup guide
- [ ] Document troubleshooting common issues:
  - [ ] Permission errors
  - [ ] Rate limiting
  - [ ] Delta token expiration

### 7.2 Destination Converter Verification
- [ ] Verify existing Google Calendar converters work with mapped data:
  - [ ] Test `destinations/airbyte-faros-destination/src/converters/googlecalendar/calendars.ts`
  - [ ] Test `destinations/airbyte-faros-destination/src/converters/googlecalendar/events.ts`
- [ ] Create Office 365-specific converters if field mapping is insufficient:
  - [ ] `destinations/airbyte-faros-destination/src/converters/office365calendar/`

### 7.3 Final Validation
- [ ] Run full test suite: `npm test`
- [ ] Run linting: `npm run lint`
- [ ] Test build: `npm run build`
- [ ] Verify connector follows Airbyte protocol
- [ ] Test with actual Microsoft 365 tenant (if available)

## Phase 8: Faros Destination Converter Implementation

### 8.1 Destination Converter Setup (O365CAL-011a)
- [ ] Create destination converter project structure
- [ ] Implement base `Office365CalendarConverter` class
- [ ] Set up TypeScript configuration for converters
- [ ] Create comprehensive test infrastructure with mock data
- [ ] Register converters in destination registry

### 8.2 Events Converter Implementation (O365CAL-011b)  
- [ ] Implement events converter with full feature parity to Google Calendar
- [ ] Add attendee processing and user creation logic
- [ ] Implement location processing with geographic resolution
- [ ] Add conference URL extraction (Teams, Zoom, etc.)
- [ ] Implement user deduplication across events
- [ ] Add timezone handling and recurring event support

### 8.3 Integration Testing and Documentation (O365CAL-011c)
- [ ] Create end-to-end integration tests (source → destination → Faros)
- [ ] Implement performance testing for large datasets (1000+ events)
- [ ] Add monitoring and telemetry for converter pipeline
- [ ] Create comprehensive documentation (setup, API, troubleshooting)
- [ ] Validate production readiness with real Office 365 data

## Phase 9: Advanced Features (Optional)

### 9.1 Enhanced Configuration
- [ ] Add support for specific user email lists (instead of all users)
- [ ] Add calendar type filtering (user vs. group calendars)
- [ ] Add event type filtering options

### 9.2 Performance Optimizations
- [ ] Implement concurrent calendar processing
- [ ] Add request caching for repeated calendar metadata calls
- [ ] Optimize delta sync state management

### 9.3 Monitoring and Observability
- [ ] Add detailed logging for sync progress
- [ ] Add metrics for API call counts and timing
- [ ] Add warnings for large calendar volumes

## 🎯 TDD Success Criteria (Non-Negotiable)

### Code Quality Gates
- [ ] **95%+ line coverage** achieved across all source code
- [ ] **100% branch coverage** for error handling paths
- [ ] **All tests pass** consistently (`npm test`)
- [ ] **TypeScript strict compilation** with zero warnings
- [ ] **ESLint clean** with no rule violations (`npm run lint`)
- [ ] **Build succeeds** without errors (`npm run build`)

### Functional Requirements
- [ ] **Connector authenticates** with Microsoft 365 tenant using OAuth2
- [ ] **Calendars and events sync** identical to Google Calendar connector behavior
- [ ] **Incremental sync works** with Microsoft Graph delta tokens
- [ ] **Field mapping accurate** - Office 365 data converts to Google Calendar schema
- [ ] **Error handling comprehensive** - All failure scenarios tested and handled
- [ ] **Performance acceptable** - Large dataset handling tested

### TDD Process Compliance
- [ ] **Every feature test-driven** - Tests written before implementation
- [ ] **Red-Green-Refactor cycle** followed for all components
- [ ] **Mock data realistic** - Matches actual Microsoft Graph API responses
- [ ] **Edge cases covered** - Error scenarios, large datasets, network failures
- [ ] **Integration tests comprehensive** - End-to-end sync scenarios validated

### Production Readiness
- [ ] **Data integrates seamlessly** with existing Faros dashboards
- [ ] **Documentation complete** and accurate for setup and troubleshooting
- [ ] **Security validated** - No credential exposure, proper error handling
- [ ] **Performance benchmarked** - Acceptable sync times for typical data volumes

### Quality Assurance
- [ ] **Code review completed** with focus on TDD compliance
- [ ] **Manual testing performed** with real Microsoft 365 tenant (if available)
- [ ] **Regression testing passed** - No impact on existing connectors
- [ ] **Deployment validation** - Connector works in target environment

**🚨 Critical: No ticket can be closed without meeting ALL TDD requirements and passing the quality gates above.**