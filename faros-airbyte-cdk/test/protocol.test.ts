import {AirbyteLog, AirbyteLogLevel} from '../src/protocol';

describe('airbyte protocol', () => {
  describe('airbyte log message', () => {
    it('should replace newlines with double spaces', () => {
      const message =
        'Encountered an error: Request failed due to following errors:' +
        '\n - Error 1\n - Error 2\n - Error 3';
      const log = AirbyteLog.make(AirbyteLogLevel.ERROR, message);
      expect(log.log.message).toBe(message.replace(/\n/g, '  '));
    });
  });
});
