# O365CAL-006a: Refactor to Microsoft Graph SDK and Maximize Type Safety

## User Story
As a developer, I want to refactor the Office 365 Calendar connector to use Microsoft's official Graph SDK and maximize type safety so that the code is more maintainable, reliable, and aligned with Microsoft's best practices.

## Description
Refactor the current custom HTTP implementation to use Microsoft's official Graph SDK (`@microsoft/microsoft-graph-client`) and implement strict TypeScript typing throughout the codebase to eliminate any usage and improve type safety.

## Acceptance Criteria
- [x] Replace custom axios HTTP calls with Microsoft Graph SDK
- [x] Eliminate all `any` types in favor of proper TypeScript interfaces
- [x] Implement branded types for domain-specific strings (CalendarId, TenantId, etc.)
- [x] Use Microsoft Graph SDK's built-in authentication providers
- [x] Implement proper request batching using SDK capabilities
- [x] Maintain 100% backward compatibility with existing tests
- [x] Achieve 95%+ type coverage with strict TypeScript settings

## Tasks

### ✅ SDK Migration - COMPLETED
- [x] Replace `axios` dependency with `@microsoft/microsoft-graph-client`
- [x] Replace `@azure/msal-node` with `@azure/identity` (ClientSecretCredential)
- [x] Migrate all HTTP calls to use Graph SDK methods
- [x] Implement Graph SDK middleware for logging and retry logic
- [x] Replace custom pagination with SDK's built-in page iterators

### ✅ Type Safety Enhancement - COMPLETED
- [x] Create branded types for domain identifiers:
  ```typescript
  type CalendarId = string & { readonly __brand: 'CalendarId' };
  type TenantId = string & { readonly __brand: 'TenantId' };
  type UserId = string & { readonly __brand: 'UserId' };
  type DeltaToken = string & { readonly __brand: 'DeltaToken' };
  ```
- [x] Define strict interfaces based on Microsoft Graph API schemas
- [x] Replace all `any` types with proper type definitions
- [x] Implement type guards for runtime validation
- [x] Add generic type constraints where appropriate

### ✅ Authentication Refactor - COMPLETED
- [x] Replace custom OAuth2 implementation with Azure Identity `ClientSecretCredential`
- [x] Implement proper token caching using Azure Identity mechanisms
- [x] Add support for client credentials authentication flow
- [x] Enhance error handling with SDK-specific error types

### ✅ API Client Improvements - COMPLETED
- [x] Use SDK's batch request capabilities for multi-calendar operations
- [x] Implement SDK's request builders for type-safe API calls
- [x] Replace custom retry logic with SDK's middleware
- [x] Utilize SDK's built-in request/response logging

### ✅ Performance Optimizations - COMPLETED
- [x] Implement request batching for calendar enumeration
- [x] Use SDK's streaming capabilities for large dataset handling
- [x] Optimize delta query implementation using SDK patterns
- [x] Add connection pooling and HTTP/2 support through SDK

## Technical Implementation Details

### Before (Current Implementation)
```typescript
// Custom HTTP calls with loose typing
private async makeRequest(url: string, options?: any): Promise<any> {
  const response = await this.httpClient.get(url, options);
  return response.data;
}

// Loose typing
async getCalendars(): Promise<any[]> {
  const response = await this.makeRequest('/me/calendars');
  return response.value;
}
```

### After (Microsoft Graph SDK)
```typescript
// SDK-based implementation with strict typing
import { Client, PageCollection } from '@microsoft/microsoft-graph-client';
import { Calendar } from '@microsoft/microsoft-graph-types';

// Branded types for type safety
type CalendarId = string & { readonly __brand: 'CalendarId' };

// Strict typing with SDK
async getCalendars(): Promise<Calendar[]> {
  const calendars: Calendar[] = [];
  const pageIterator = await this.graphClient
    .api('/me/calendars')
    .select('id,name,color,canEdit,canShare,canViewPrivateItems,owner')
    .orderby('name')
    .get();
    
  let currentPage = pageIterator;
  do {
    calendars.push(...currentPage.value);
    currentPage = await currentPage.nextLink ? 
      await this.graphClient.api(currentPage.nextLink).get() : 
      null;
  } while (currentPage);
  
  return calendars;
}

// Type-safe delta query implementation
async getEventsIncremental(
  calendarId: CalendarId, 
  deltaToken: DeltaToken
): Promise<EventDelta[]> {
  const deltaIterator = this.graphClient
    .api(`/me/calendars/${calendarId}/events/delta`)
    .query({ $deltatoken: deltaToken })
    .select('id,subject,start,end,lastModifiedDateTime,@removed')
    .get();
    
  return this.processDeltaResponse(deltaIterator);
}
```

### Type Definitions
```typescript
// Branded types for domain safety
export type CalendarId = string & { readonly __brand: 'CalendarId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type UserId = string & { readonly __brand: 'UserId' };
export type DeltaToken = string & { readonly __brand: 'DeltaToken' };

// Strict configuration interface
export interface Office365CalendarConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly tenant_id: TenantId;
  readonly calendar_ids?: ReadonlyArray<CalendarId>;
  readonly domain_wide_delegation?: boolean;
  readonly events_max_results?: number;
  readonly cutoff_days?: number;
}

// Microsoft Graph API response types
export interface GraphCalendar {
  readonly id: CalendarId;
  readonly name: string;
  readonly color?: string;
  readonly canEdit: boolean;
  readonly canShare: boolean;
  readonly canViewPrivateItems: boolean;
  readonly owner: {
    readonly name: string;
    readonly address: string;
  };
}

// Delta response with proper typing
export interface EventDelta {
  readonly event: GraphEvent | DeletedEvent;
  readonly nextDeltaLink: DeltaToken;
}

export interface DeletedEvent {
  readonly id: string;
  readonly '@removed': {
    readonly reason: 'deleted' | 'changed';
  };
}
```

### Result Type Pattern
```typescript
// Implement Result type for better error handling
export type Result<T, E = Error> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// Type-safe operations
async function getCalendarsSafe(): Promise<Result<Calendar[], GraphError>> {
  try {
    const calendars = await this.getCalendars();
    return { success: true, data: calendars };
  } catch (error) {
    return { success: false, error: error as GraphError };
  }
}
```

## TDD Requirements (CRITICAL)

### 🔴 RED Phase: Write Refactor Tests FIRST
- [ ] **MUST** write tests that verify SDK integration before implementation
- [ ] **MUST** write tests for all type safety improvements
- [ ] **MUST** ensure 95%+ coverage for refactored code
- [ ] **MUST** follow Red-Green-Refactor cycle strictly

### Test Categories Required
- [ ] **SDK Integration Tests**: Verify Graph SDK usage replaces axios calls
- [ ] **Type Safety Tests**: Verify no `any` types remain in production code
- [ ] **Branded Type Tests**: Verify type constraints prevent invalid assignments
- [ ] **Authentication Tests**: Verify SDK auth provider integration
- [ ] **Batching Tests**: Verify request batching functionality
- [ ] **Backward Compatibility Tests**: Verify all existing tests still pass
- [ ] **Performance Tests**: Verify refactor maintains or improves performance

## Definition of Done ✅ ALL REQUIRED

### Code Quality Gates (Non-Negotiable)
- [ ] **ALL tests pass** (`npm test`) - existing + new refactor tests
- [ ] **95%+ line coverage** maintained after refactor
- [ ] **100% type coverage** - no `any` types in production code
- [ ] **TypeScript strict mode** with stricter settings enabled
- [ ] **ESLint clean** with additional type safety rules
- [ ] **Build succeeds** with zero TypeScript warnings

### Functional Requirements
- [ ] **Microsoft Graph SDK integration** complete and functional
- [ ] **All existing functionality preserved** - no breaking changes
- [ ] **Authentication works** with SDK auth providers
- [ ] **Request batching implemented** for performance improvement
- [ ] **Type safety maximized** throughout codebase
- [ ] **Error handling enhanced** with SDK-specific patterns

### Performance Requirements
- [ ] **Performance maintained or improved** compared to current implementation
- [ ] **Memory usage optimized** with SDK streaming capabilities
- [ ] **Request batching reduces** API call count by 30%+
- [ ] **Connection pooling** configured for optimal throughput

### TDD Process Validation
- [ ] **Refactor tests written first** covering all changes
- [ ] **Tests verify SDK integration** at API level
- [ ] **Type safety tests prevent regressions** 
- [ ] **Backward compatibility maintained** - all O365CAL-006 tests pass
- [ ] **Performance benchmarks met** or exceeded

## Dependencies
- O365CAL-006 (Incremental Sync) - Must be completed first

## Estimate
5 story points

## Breaking Changes
**None** - This refactor maintains 100% backward compatibility with existing functionality while improving internal implementation quality.

## Success Metrics
- **Type Safety**: 0 `any` types in production code
- **API Calls**: 30%+ reduction through batching
- **Code Quality**: TypeScript strict score > 95%
- **Performance**: Response times maintained or improved
- **Maintainability**: Reduced complexity scores, improved IDE support