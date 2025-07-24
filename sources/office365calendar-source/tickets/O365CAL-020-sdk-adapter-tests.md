# O365CAL-020: Enable SDK Adapter Tests (MEDIUM IMPACT)

## Objective
Create or enable comprehensive test coverage for `office365calendar-sdk-adapter.ts` which currently has extremely low coverage.

**Current**: `office365calendar-sdk-adapter.ts` coverage at 8.77%  
**Target**: >65% coverage  
**Estimated Impact**: +15-20% overall coverage

## Background
The SDK adapter is a critical component that wraps the Microsoft Graph API client and provides the interface between our Office 365 implementation and the raw Graph API. Low coverage here represents a significant risk.

## Tasks

### Phase 1: Analyze Current State
- [ ] Review office365calendar-sdk-adapter.ts implementation
- [ ] Identify if test file exists or needs creation
- [ ] Map all public methods requiring test coverage
- [ ] Document current coverage gaps

### Phase 2: Create/Enable Test Suite
- [ ] Create `test/office365calendar-sdk-adapter.test.ts` if missing
- [ ] Or enable existing test if disabled elsewhere
- [ ] Set up proper test structure and mocking

### Phase 3: Test Graph API Client Wrapper
- [ ] Test Microsoft Graph client initialization
- [ ] Test authentication token management
- [ ] Test API endpoint configuration
- [ ] Test request/response transformation
- [ ] Test timeout and retry configuration

### Phase 4: Test Core API Methods
- [ ] Test getCalendars() method with pagination
- [ ] Test getEvents() method with filtering
- [ ] Test getEventsIncremental() with delta queries
- [ ] Test getUsers() for domain delegation
- [ ] Test checkConnection() validation

### Phase 5: Test Error Handling
- [ ] Test authentication failures and token refresh
- [ ] Test rate limiting (429) response handling
- [ ] Test network timeout scenarios
- [ ] Test malformed API response handling
- [ ] Test permission denied scenarios

### Phase 6: Test Response Mapping
- [ ] Test Office 365 → Google Calendar schema transformation
- [ ] Test date/time format conversion
- [ ] Test attendee and organizer mapping
- [ ] Test calendar permissions mapping
- [ ] Test event status and visibility mapping

## Technical Approach

### Mock Strategy
```typescript
// Mock Microsoft Graph Client
jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: jest.fn(),
    api: jest.fn()
  }
}));

// Use existing test helpers
import { createMockHttpClient, createTokenResponse } from '../utils/test-helpers';
```

### Key Test Patterns
```typescript
describe('Office365CalendarSDKAdapter', () => {
  describe('Graph API Integration', () => {
    test('should initialize Graph client with correct configuration');
    test('should handle authentication token lifecycle');
  });
  
  describe('Data Transformation', () => {
    test('should map Office 365 events to Google Calendar format');
    test('should handle all-day events correctly');
  });
  
  describe('Error Handling', () => {
    test('should retry on rate limit with exponential backoff');
    test('should refresh tokens on 401 responses');
  });
});
```

## Files to Create/Modify
- `test/office365calendar-sdk-adapter.test.ts` - Main test file
- `test/utils/test-helpers.ts` - Add Graph API mocking helpers if needed
- Update any test configuration as needed

## Success Criteria
- [ ] office365calendar-sdk-adapter.ts coverage >65%
- [ ] All major SDK adapter methods tested
- [ ] Error handling scenarios covered
- [ ] Response transformation tested
- [ ] Overall test coverage >80%
- [ ] CI pipeline passing

## Dependencies
- Part of O365CAL-017 Test Coverage Epic
- Should be completed after O365CAL-018 and O365CAL-019
- May require additional mock helpers

## Risk Assessment
**Medium Risk** - May need to create comprehensive test from scratch. Requires deep understanding of Microsoft Graph API integration.

## Estimated Time
2-3 hours (depending on whether test file exists)