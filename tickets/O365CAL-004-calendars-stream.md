# O365CAL-004: Calendars Stream Implementation

## User Story
As a user, I want to sync calendar metadata from Office 365 so that I can identify and track all available calendars in my organization.

## Description
Implement the calendars stream that fetches calendar metadata from Microsoft Graph API, supporting both individual user and domain-wide delegation scenarios.

## Acceptance Criteria
- [ ] Calendars stream extends AirbyteStreamBase correctly
- [ ] Full refresh sync mode supported
- [ ] Domain-wide delegation works for organization-wide calendar access
- [ ] Calendar data mapped to match Google Calendar schema
- [ ] Stream follows the same patterns as Google Calendar connector

## Tasks
### Stream Setup
- [ ] Create `src/streams/calendars.ts`
- [ ] Extend `AirbyteStreamBase` with proper configuration
- [ ] Set stream name: `"calendars"`
- [ ] Set primary key: `["id"]`
- [ ] Set supported sync modes: `[SyncMode.full_refresh]`
- [ ] Import and use calendar JSON schema

### Core Implementation
- [ ] Implement `readRecords()` method using API client's `getCalendars()`
- [ ] Handle single user vs. domain-wide delegation logic:
  - If `domain_wide_delegation` is true, iterate through users
  - If `calendar_ids` specified, fetch only those calendars
  - Default to current user's calendars
- [ ] Map Office 365 calendar fields to Google Calendar schema format
- [ ] Handle calendar permissions and access levels

### Data Mapping
- [ ] Map Microsoft Graph calendar properties to expected schema:
  - `id` → `id`
  - `name` → `summary`
  - `description` → `description`
  - `owner` → `owner` (extract email/name)
  - `canEdit` → map to access role
- [ ] Handle special calendar types (primary, shared, group)
- [ ] Ensure output matches Google Calendar stream format

### Error Handling
- [ ] Handle permission errors for inaccessible calendars
- [ ] Skip calendars that can't be accessed rather than failing
- [ ] Log warnings for skipped calendars
- [ ] Handle API rate limiting during calendar enumeration

## Definition of Done
- [ ] Stream compiles and integrates with source correctly
- [ ] Can fetch calendars in full refresh mode
- [ ] Domain-wide delegation works for multi-user scenarios
- [ ] Calendar data format matches Google Calendar output
- [ ] Permission errors are handled gracefully
- [ ] Stream follows Airbyte protocol correctly
- [ ] Proper logging for sync progress and issues

## Dependencies
- O365CAL-003 (Authentication and API Client)

## Estimate
5 story points