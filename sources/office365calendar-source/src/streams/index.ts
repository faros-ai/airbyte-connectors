/**
 * Stream implementations for the Office 365 Calendar connector.
 * 
 * This module exports all available stream classes that can be used to sync
 * data from Office 365 calendars.
 * 
 * @module streams
 */

import { Calendars } from './calendars';
import { Events } from './events';

/**
 * Calendars stream for syncing calendar metadata from Office 365.
 * 
 * @class Calendars
 */
export { Calendars };

/**
 * Events stream for syncing calendar events from Office 365.
 * 
 * @class Events
 */
export { Events };