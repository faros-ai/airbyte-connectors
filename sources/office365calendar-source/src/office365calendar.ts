// This file now re-exports the new Microsoft Graph SDK-based implementation
// for backward compatibility with existing imports

export { Office365Calendar } from './office365calendar-sdk-adapter';
export { 
  Office365CalendarConfig,
  Calendar,
  Event,
  DeletedEvent,
  EventDelta,
  DeltaResponse,
  PagedResponse,
  GraphCalendar,
  GraphEvent,
  TenantId,
  CalendarId,
  UserId,
  DeltaToken,
  TenantIdFactory,
  CalendarIdFactory,
  UserIdFactory,
  DeltaTokenFactory
} from './models';