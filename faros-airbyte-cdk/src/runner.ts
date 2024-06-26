import {AirbyteLogger} from './logger';
import {AirbyteTraceFailureType} from './protocol';

export const ConnectorVersion = process.env['CONNECTOR_VERSION'] || 'unknown';

export abstract class Runner {
  constructor(protected readonly logger: AirbyteLogger) {
    process.on('unhandledRejection', (error) => {
      throw error;
    });
    process.on('uncaughtException', (error) => {
      logger.traceError(error, AirbyteTraceFailureType.SYSTEM_ERROR);
      process.exit(1);
    });
  }

  protected logNodeOptions(connectorType: 'Source' | 'Destination'): void {
    if (process.env['NODE_OPTIONS']) {
      this.logger.info(
        `${connectorType} NODE_OPTIONS: ${process.env['NODE_OPTIONS']}`
      );
    }
  }
}
