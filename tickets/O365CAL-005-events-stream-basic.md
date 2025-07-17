# O365CAL-005: Events Stream Basic Implementation (Full Refresh)

## User Story
As a user, I want to sync calendar events from Office 365 so that I can analyze meeting patterns and time allocation in my organization.

## Description
Implement the basic events stream with full refresh capability, including stream slicing by calendar and field mapping to match Google Calendar format.

## Acceptance Criteria
- [ ] Events stream supports full refresh sync mode
- [ ] Stream slicing implemented by calendar ID
- [ ] Event data mapped to Google Calendar schema format
- [ ] Cutoff days filtering applied correctly
- [ ] Events max results pagination works
- [ ] Stream follows the same patterns as Google Calendar connector

## Tasks
### Stream Setup
- [ ] Create `src/streams/events.ts`
- [ ] Extend `AirbyteStreamBase` with proper configuration
- [ ] Set stream name: `"events"`
- [ ] Set primary key: `["id"]`
- [ ] Set supported sync modes: `[SyncMode.full_refresh]` (incremental in next ticket)
- [ ] Import and use events JSON schema

### Stream Slicing Implementation
- [ ] Implement stream slices by calendar ID (same as Google Calendar)
- [ ] Use calendars from configuration or fetch all available calendars
- [ ] Each slice represents one calendar's events
- [ ] Handle calendar access permissions during slicing

### Full Refresh Implementation
- [ ] Implement `readRecords()` method for full refresh
- [ ] Use API client's `getEvents(calendarId)` method
- [ ] Apply `cutoff_days` filtering:
  - Calculate start date: `now - cutoff_days`
  - Use Graph API `$filter=start/dateTime ge '{startDate}'`
- [ ] Handle `events_max_results` pagination parameter
- [ ] Process all pages of results for each calendar

### Data Mapping
- [ ] Map Microsoft Graph event properties to Google Calendar schema:
  - `subject` → `summary`
  - `start.dateTime` → `start.dateTime`
  - `end.dateTime` → `end.dateTime`
  - `attendees` → `attendees` (convert structure)
  - `organizer` → `organizer` (convert structure)
  - `location` → `location`
  - `body.content` → `description`
  - `showAs` → `transparency`
  - `importance` → map to appropriate field
- [ ] Handle recurring events properly
- [ ] Convert time zones to consistent format
- [ ] Map event status and visibility fields

### Error Handling
- [ ] Handle calendar access permission errors
- [ ] Skip inaccessible calendars rather than failing
- [ ] Handle API rate limiting during event fetching
- [ ] Log warnings for skipped calendars or events
- [ ] Handle malformed event data gracefully

## Definition of Done
- [ ] Stream compiles and integrates with source correctly
- [ ] Can fetch events in full refresh mode
- [ ] Stream slicing works correctly per calendar
- [ ] Event data format matches Google Calendar output exactly
- [ ] Cutoff days filtering works as expected
- [ ] Pagination handles large event sets correctly
- [ ] Permission errors are handled gracefully
- [ ] Stream follows Airbyte protocol correctly

## Dependencies
- O365CAL-004 (Calendars Stream)

## Estimate
8 story points