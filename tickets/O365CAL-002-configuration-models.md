# O365CAL-002: Configuration Specification and TypeScript Models

## User Story
As a user, I want to configure the Office 365 Calendar connector with Microsoft Graph API credentials so that I can authenticate and connect to my organization's calendar data.

## Description
Create the configuration specification and TypeScript models for Office 365 authentication and API interaction, ensuring compatibility with the same optional parameters as Google Calendar.

## Acceptance Criteria
- [ ] Configuration spec supports OAuth2 client credentials flow
- [ ] Same optional parameters as Google Calendar (calendar_ids, cutoff_days, events_max_results, domain_wide_delegation)
- [ ] TypeScript interfaces defined for all API responses
- [ ] JSON schemas created for calendars and events streams
- [ ] Configuration validation works properly

## TDD Requirements (CRITICAL)
**🔴 RED Phase: Write Tests First**
- [ ] **MUST** write failing tests before any implementation
- [ ] **MUST** achieve 95%+ line coverage
- [ ] **MUST** test all configuration validation scenarios
- [ ] **MUST** test TypeScript interface compliance

## Tasks

### 🔴 Phase 1: Write Configuration Tests (RED)
- [ ] Create `test/models.test.ts` with comprehensive failing tests:
  - [ ] `validateOffice365CalendarConfig()` accepts valid configuration
  - [ ] `validateOffice365CalendarConfig()` rejects missing client_id
  - [ ] `validateOffice365CalendarConfig()` rejects missing client_secret  
  - [ ] `validateOffice365CalendarConfig()` rejects missing tenant_id
  - [ ] `validateOffice365CalendarConfig()` rejects invalid tenant_id format
  - [ ] `validateOffice365CalendarConfig()` accepts optional calendar_ids array
  - [ ] `validateOffice365CalendarConfig()` accepts optional domain_wide_delegation boolean
  - [ ] `validateOffice365CalendarConfig()` validates events_max_results range (1-2500)
  - [ ] `validateOffice365CalendarConfig()` validates cutoff_days minimum value
- [ ] Create `test/spec-validation.test.ts`:
  - [ ] Validates spec.json schema compliance
  - [ ] Tests required field definitions
  - [ ] Tests optional field definitions with defaults
- [ ] **Run tests to verify they FAIL appropriately**

### 🟢 Phase 2: Implement Configuration (GREEN)
- [ ] Create `resources/spec.json` to make tests pass:
  - [ ] Update title to `"Office 365 Calendar Spec"`
  - [ ] Replace required fields: `"client_id"`, `"client_secret"`, `"tenant_id"`
  - [ ] Keep optional fields: `"calendar_ids"`, `"domain_wide_delegation"`, `"events_max_results"`, `"cutoff_days"`
  - [ ] Update field descriptions for Microsoft Graph API context
  - [ ] Update domain_wide_delegation description for Microsoft 365 Application permissions

### 🟢 Phase 3: Implement TypeScript Models (GREEN)
- [ ] Create `src/models.ts` to make tests pass:
  - [ ] `Office365CalendarConfig` interface with strict typing
  - [ ] `Calendar` interface for Graph API calendar objects
  - [ ] `Event` interface for Graph API event objects  
  - [ ] `DeltaResponse` interface for Graph API delta queries
  - [ ] `PagedResponse<T>` interface for paginated responses
  - [ ] Configuration validation functions with proper error handling

### 🟢 Phase 4: Implement JSON Schemas (GREEN)
- [ ] Create schemas to make tests pass:
  - [ ] Copy `resources/schemas/calendars.json` from Google Calendar
  - [ ] Copy `resources/schemas/events.json` from Google Calendar
  - [ ] Update field mappings for Office 365 API responses
  - [ ] Map `subject` to `summary` in events schema
  - [ ] Update attendee structure for Graph API format
  - [ ] Adjust recurrence pattern structure

### 🔵 Phase 5: Refactor (REFACTOR)
- [ ] **Verify ALL tests pass with 95%+ coverage**
- [ ] Improve type safety and error messages
- [ ] Add comprehensive JSDoc documentation
- [ ] Optimize validation performance
- [ ] Add additional edge case tests if needed

## Definition of Done (TDD Compliance Required)
### Code Quality Gates (Non-Negotiable)
- [ ] **ALL tests pass** (`npm test`)
- [ ] **95%+ line coverage** achieved (`npm run test-cov`)
- [ ] **100% branch coverage** for error handling paths
- [ ] **TypeScript strict compilation** with zero warnings
- [ ] **ESLint clean** (`npm run lint`)

### Functional Requirements
- [ ] Configuration spec validates correctly with required fields
- [ ] TypeScript models compile without errors
- [ ] JSON schemas are valid and match expected API responses
- [ ] Optional parameters work the same as Google Calendar connector
- [ ] Configuration error messages are clear and helpful

### TDD Process Validation
- [ ] **Tests written BEFORE implementation** (commit history proves this)
- [ ] **Red-Green-Refactor cycle** followed for all components
- [ ] **Mock data realistic** and matches Microsoft Graph API structure
- [ ] **Edge cases comprehensively tested**
- [ ] **Error scenarios validated** with specific assertions

**🚨 CRITICAL: This ticket cannot be closed until ALL TDD requirements are met and verified.**

## Dependencies
- O365CAL-001 (Project Setup)

## Estimate
3 story points