import {AirbyteLogger} from './logger';
import {AirbyteFailureType} from './protocol';

export abstract class Runner {
  constructor(protected readonly logger: AirbyteLogger) {
    process.on('unhandledRejection', (error) => {
      throw error;
    });
    process.on('uncaughtException', (error) => {
      logger.trace(error, AirbyteFailureType.SYSTEM_ERROR);
      process.exit(1);
    });
  }
}
