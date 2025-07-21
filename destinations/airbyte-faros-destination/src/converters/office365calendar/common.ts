import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/**
 * Base converter class for Office 365 Calendar connectors.
 * 
 * This abstract class provides common functionality for all Office 365 Calendar
 * converters, following the same pattern as other source converters in the Faros
 * destination.
 */
export abstract class Office365CalendarConverter extends Converter {
  /**
   * Source identifier for Office 365 Calendar converters.
   * This distinguishes Office 365 Calendar data from other calendar sources.
   */
  source = 'Office365Calendar';

  /**
   * Extract the unique identifier from an Office 365 Calendar record.
   * 
   * Every Office 365 Calendar record should have an 'id' property that serves
   * as the unique identifier for that record.
   * 
   * @param record - The Airbyte record containing Office 365 Calendar data
   * @returns The unique identifier string, or undefined if not found
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}