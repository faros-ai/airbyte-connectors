import { Command } from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import { VError } from 'verror';
import type { VErrorType } from './models';

import {
  Office365CalendarConfig,
  validateOffice365CalendarConfig,
  LogUtils,
  ErrorUtils,
} from './models';
import { Office365Calendar } from './office365calendar';
import { Calendars, Events } from './streams';

/**
 * Creates and configures the main command for the Office 365 Calendar source.
 * 
 * This function initializes the Airbyte source runner with the Office 365 Calendar source
 * implementation and returns a Command instance that can be used as the entry point
 * for the connector.
 * 
 * @returns {Command} The configured Commander.js command instance
 * 
 * @example
 * ```typescript
 * const command = mainCommand();
 * command.parse(process.argv);
 * ```
 */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new Office365CalendarSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/**
 * Office 365 Calendar source implementation extending AirbyteSourceBase.
 * 
 * This class provides the main implementation for the Office 365 Calendar connector,
 * handling configuration validation, connection testing, and stream initialization.
 * It integrates with Microsoft Graph API to fetch calendar and event data.
 * 
 * @extends {AirbyteSourceBase<Office365CalendarConfig>}
 */
export class Office365CalendarSource extends AirbyteSourceBase<Office365CalendarConfig> {
  private readonly structuredLogger: ReturnType<typeof LogUtils.createStructuredLogger>;
  
  /**
   * Creates an instance of Office365CalendarSource.
   * 
   * @param {AirbyteSourceLogger} logger - The Airbyte logger instance for logging operations
   */
  constructor(logger: AirbyteSourceLogger) {
    super(logger);
    this.structuredLogger = LogUtils.createStructuredLogger(logger);
    this.structuredLogger.info('Office365CalendarSource initialized', {
      sourceType: this.type,
      sdkVersion: '1.0.0'
    });
  }

  /**
   * Gets the type identifier for this source.
   * 
   * @returns {string} The source type identifier 'office365-calendar'
   */
  get type(): string {
    return 'office365-calendar';
  }

  /**
   * Returns the connector specification that defines the configuration schema.
   * 
   * The specification includes all configuration options, their types, validation rules,
   * and descriptions for the Office 365 Calendar connector.
   * 
   * @returns {Promise<AirbyteSpec>} Promise resolving to the connector specification
   * 
   * @example
   * ```typescript
   * const source = new Office365CalendarSource(logger);
   * const spec = await source.spec();
   * console.log(spec.connectionSpecification.properties);
   * ```
   */
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  /**
   * Validates the connection to Office 365 using the provided configuration.
   * 
   * This method performs comprehensive connection testing including:
   * - Configuration validation
   * - Authentication with Microsoft Graph API
   * - Basic connectivity test
   * - Optional calendar access verification
   * 
   * @param {Office365CalendarConfig} config - The configuration object containing credentials and settings
   * @returns {Promise<[boolean, VErrorType | undefined]>} Promise resolving to a tuple of [success, error]
   * 
   * @throws {VError} When configuration validation fails
   * 
   * @example
   * ```typescript
   * const config = {
   *   tenant_id: 'your-tenant-id',
   *   client_id: 'your-client-id',
   *   client_secret: 'your-client-secret'
   * };
   * const [isConnected, error] = await source.checkConnection(config);
   * if (!isConnected) {
   *   console.error('Connection failed:', error?.message);
   * }
   * ```
   */
  async checkConnection(
    config: Office365CalendarConfig
  ): Promise<[boolean, VErrorType | undefined]> {
    this.structuredLogger.debug('Checking connection to Office 365', {
      tenantId: config.tenant_id,
      clientId: config.client_id,
      domainWideDelegation: config.domain_wide_delegation
    });

    try {
      // Validate configuration first
      validateOffice365CalendarConfig(config);
      
      // Create Office 365 Calendar API client
      const office365Calendar = await Office365Calendar.instance(config, this.logger);
      
      // Test basic connectivity
      const isConnected = await office365Calendar.checkConnection();
      
      if (!isConnected) {
        const error = new VError(
          'Failed to connect to Office 365. Please verify your tenant_id, client_id, and client_secret are correct ' +
          'and your application has the required permissions (Calendars.Read).'
        );
        this.structuredLogger.error('Connection check failed', {
          error: 'Basic connectivity test failed',
          tenantId: config.tenant_id
        });
        return [false, error];
      }

      // If specific calendars are configured, verify access to them
      if (config.calendar_ids && config.calendar_ids.length > 0) {
        this.structuredLogger.debug('Verifying access to specific calendars', {
          calendarCount: config.calendar_ids.length
        });
        
        try {
          const calendars = [];
          for await (const calendar of office365Calendar.getCalendars()) {
            calendars.push(calendar.id);
          }
          
          this.structuredLogger.debug('Successfully verified calendar access', {
            accessibleCalendars: calendars.length
          });
        } catch (calendarError) {
          this.structuredLogger.warn('Could not verify specific calendar access', {
            error: ErrorUtils.getMessage(calendarError)
          });
          // Don't fail the connection check for this - calendars might be filtered at runtime
        }
      }

      this.structuredLogger.info('Successfully connected to Office 365', {
        tenantId: config.tenant_id,
        calendarFiltering: config.calendar_ids ? 'enabled' : 'disabled'
      });

      return [true, undefined];

    } catch (error: unknown) {
      let errorMessage = 'Failed to connect to Office 365';
      
      const errorObj = error as Error;
      
      // Provide specific error messages for common issues
      if (errorObj.message?.includes('Authentication failed') || 
          errorObj.message?.includes('Unauthorized') ||
          errorObj.message?.includes('invalid_client')) {
        errorMessage = 'Please verify your tenant_id, client_id, and client_secret are correct';
      } else if (errorObj.message?.includes('Tenant') && errorObj.message?.includes('not found')) {
        errorMessage = 'Please verify your tenant_id is correct';
      } else if (errorObj.message?.includes('Insufficient privileges') ||
                 errorObj.message?.includes('Forbidden')) {
        errorMessage = 'Please verify your application has the required permissions (Calendars.Read)';
      } else if (errorObj.message?.includes('timeout') || 
                 errorObj.message?.includes('network') ||
                 errorObj.message?.includes('ENOTFOUND')) {
        errorMessage = 'Network connectivity issue. Please check your internet connection';
      }

      const vError = new VError(errorObj, `${errorMessage}. Error: ${errorObj?.message}`);
      
      this.structuredLogger.error('Connection check failed', {
        error: ErrorUtils.getMessage(errorObj),
        tenantId: config.tenant_id,
        errorType: errorObj?.constructor?.name
      });

      return [false, vError];
    }
  }

  /**
   * Initializes and returns the available data streams for the Office 365 Calendar source.
   * 
   * This method creates instances of all available streams (Calendars and Events) that
   * can be synchronized from Office 365. Each stream is configured with the provided
   * configuration and logger.
   * 
   * @param {Office365CalendarConfig} config - The validated configuration object
   * @returns {AirbyteStreamBase[]} Array of initialized stream instances
   * 
   * @throws {VError} When stream initialization fails
   * 
   * @example
   * ```typescript
   * const config = { tenant_id: 'tenant', client_id: 'client', client_secret: 'secret' };
   * const streams = source.streams(config);
   * console.log(streams.map(s => s.name)); // ['calendars', 'events']
   * ```
   */
  streams(config: Office365CalendarConfig): AirbyteStreamBase[] {
    this.structuredLogger.debug('Initializing streams', {
      streamCount: 2,
      calendarIds: config.calendar_ids?.length || 'all',
      domainWideDelegation: config.domain_wide_delegation
    });

    try {
      const streams = [
        new Calendars(config, this.logger),
        new Events(config, this.logger),
      ];

      this.structuredLogger.info('Successfully initialized all streams', {
        streams: streams.map(s => s.name)
      });

      return streams;
    } catch (error: unknown) {
      const errorObj = error as Error;
      this.structuredLogger.error('Failed to initialize streams', {
        error: ErrorUtils.getMessage(errorObj),
        errorType: errorObj?.constructor?.name
      });
      throw new VError(errorObj, 'Failed to initialize Office 365 Calendar streams');
    }
  }
}