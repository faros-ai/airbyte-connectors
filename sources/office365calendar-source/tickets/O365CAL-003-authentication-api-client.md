# O365CAL-003: Authentication and API Client Implementation

## User Story
As a developer, I want to implement Microsoft Graph API authentication and core client functionality so that the connector can securely access Office 365 calendar data.

## Description
Implement OAuth2 client credentials authentication and create the core API client for Microsoft Graph, following the same singleton pattern and error handling as the Azure AD connector.

## Acceptance Criteria
- [ ] OAuth2 client credentials flow implemented
- [ ] Singleton API client pattern following Azure AD connector
- [ ] Connection validation works
- [ ] Generic pagination helper implemented
- [ ] Proper error handling and retry logic
- [ ] Rate limiting handling for Microsoft Graph API

## TDD Requirements (CRITICAL)
**🔴 RED Phase: Write Tests First**
- [ ] **MUST** write comprehensive failing tests before any implementation
- [ ] **MUST** achieve 95%+ line coverage
- [ ] **MUST** test all authentication scenarios including failures
- [ ] **MUST** test all API methods with mocked Graph API responses

## Tasks

### 🔴 Phase 1: Write Authentication Tests (RED)
- [ ] Create `test/office365calendar.test.ts` with failing tests:
  - [ ] `Office365Calendar.instance()` creates singleton with valid config
  - [ ] `Office365Calendar.instance()` throws VError on missing client_id
  - [ ] `Office365Calendar.instance()` throws VError on missing client_secret
  - [ ] `Office365Calendar.instance()` throws VError on missing tenant_id
  - [ ] `Office365Calendar.instance()` throws VError on invalid tenant_id format
  - [ ] `getAccessToken()` returns valid bearer token with proper headers
  - [ ] `getAccessToken()` handles 401 auth failures with descriptive errors
  - [ ] `getAccessToken()` handles network failures with retry logic
  - [ ] `checkConnection()` validates API connectivity with simple call
  - [ ] `checkConnection()` returns appropriate error messages on failure
- [ ] **Run tests to verify they FAIL appropriately**

### 🟢 Phase 2: Implement Authentication (GREEN)
- [ ] Create `src/office365calendar.ts` to make tests pass:
  - [ ] Implement singleton pattern for API client instance
  - [ ] Add OAuth2 client credentials flow:
    - Token endpoint: `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token`
    - Scope: `https://graph.microsoft.com/.default`
    - Grant type: `client_credentials`
  - [ ] Create axios instance with Bearer token authentication
  - [ ] Base URL: `https://graph.microsoft.com/v1.0`
  - [ ] Add proper timeout and content length settings

### Core API Methods
- [ ] Implement `checkConnection()` method (test with simple calendars call)
- [ ] Implement `getCalendars()` method:
  - Use `/me/calendars` endpoint for single user
  - Use `/users/{userId}/calendars` for domain-wide delegation
  - Handle pagination with `@odata.nextLink`
- [ ] Implement `getEvents(calendarId)` method:
  - Use `/calendars/{calendarId}/events` endpoint
  - Apply `cutoff_days` filter with `$filter=start/dateTime ge '{date}'`
  - Handle pagination and `events_max_results`
- [ ] Implement `getEventsIncremental(calendarId, deltaLink)` method:
  - Use `/calendars/{calendarId}/events/delta` endpoint
  - Handle `@odata.deltaLink` for next sync
  - Process `@removed` annotations for deleted events

### Pagination and Error Handling
- [ ] Implement generic pagination helper (following Azure AD pattern):
  - Handle `@odata.nextLink` responses
  - Extract `$skiptoken` parameters
  - Yield results as async generator
- [ ] Add retry logic for rate limiting (429 responses)
- [ ] Handle Graph API error responses
- [ ] Map Office 365 errors to Airbyte error format
- [ ] Add proper logging for API calls and errors

### Token Management
- [ ] Implement token refresh logic
- [ ] Handle token expiration gracefully
- [ ] Add token validation before API calls
- [ ] Cache valid tokens appropriately

### 🔵 Phase 3: Authentication Refactor (BLUE) - Microsoft Graph Spec Compliance
- [ ] **CRITICAL: Enhance authentication to 110% Microsoft Graph API compliance**
- [ ] Add required HTTP headers:
  - [ ] User-Agent header for API tracking: `office365calendar-source/1.0.0`
  - [ ] Accept header: `application/json`
- [ ] Complete token response validation:
  - [ ] Validate `token_type` is "Bearer"
  - [ ] Parse and validate `expires_in` field
  - [ ] Handle optional `ext_expires_in` field
  - [ ] Verify returned `scope` matches requested scope
- [ ] Implement proper token lifecycle management:
  - [ ] Token expiration tracking and automatic refresh
  - [ ] Token caching optimization (avoid unnecessary auth calls)
  - [ ] Preemptive token refresh before expiration
- [ ] Enhanced scope management:
  - [ ] Request specific scopes: `https://graph.microsoft.com/Calendars.Read`
  - [ ] Validate granted permissions match requirements
  - [ ] Handle insufficient permissions gracefully
- [ ] Add tenant validation:
  - [ ] Validate tenant exists via discovery endpoint
  - [ ] Verify app registration in tenant
  - [ ] Clear error messages for tenant/app mismatches
- [ ] Complete Azure AD error handling:
  - [ ] Handle `invalid_tenant` error code
  - [ ] Handle `invalid_client` error code  
  - [ ] Handle `invalid_scope` error code
  - [ ] Handle `unauthorized_client` error code
  - [ ] Provide actionable error messages for each scenario
- [ ] Add request tracking and debugging:
  - [ ] Log request/response correlation IDs
  - [ ] Include Azure request IDs in error messages
  - [ ] Structured logging for auth flow debugging

## Definition of Done
- [ ] API client singleton works correctly
- [ ] Authentication flow succeeds with valid credentials
- [ ] Connection validation catches invalid credentials
- [ ] Pagination works for large result sets
- [ ] Rate limiting is handled properly (429 responses)
- [ ] Error messages are clear and actionable
- [ ] All API methods return properly typed responses
- [ ] Code follows the same patterns as Azure AD connector
- [ ] **Authentication is 110% compliant with Microsoft Graph API specification**
- [ ] **Token lifecycle is properly managed with caching and refresh**
- [ ] **All Azure AD error scenarios are handled with clear messages**

## Dependencies
- O365CAL-002 (Configuration and Models)

## Estimate
8 story points