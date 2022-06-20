import {AirbyteLogger} from './logger';

export abstract class Runner {
  constructor(logger: AirbyteLogger) {
    process.on('unhandledRejection', (error) => {
      throw error;
    });
    process.on('uncaughtException', (error) => {
      logger.trace(error);
      process.exit(1);
    });
  }
}
