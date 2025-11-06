import fs from 'fs';
import os from 'os';
import path from 'path';
import VError from 'verror';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConnectionStatus,
  AirbyteLogger,
  AirbyteMessageType,
  AirbyteSourceBase,
  AirbyteSpec,
  SyncMode,
} from '../../src';
import {AirbyteSourceLogger} from '../../src/sources/source-logger';
import {AirbyteSourceRunner} from '../../src/sources/source-runner';
import {
  AirbyteStreamBase,
  StreamKey,
} from '../../src/sources/streams/stream-base';
import {Dictionary} from 'ts-essentials';

class TestStream extends AirbyteStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return {
      type: 'object',
      properties: {
        id: {type: 'string'},
      },
    };
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {
    yield {id: 'test-1'};
    yield {id: 'test-2'};
  }
}

class TestSource extends AirbyteSourceBase<AirbyteConfig> {
  constructor(
    logger: AirbyteLogger,
    private readonly shouldCheckSucceed: boolean = true
  ) {
    super(logger);
  }

  get type(): string {
    return 'test-source';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec({
      connectionSpecification: {
        type: 'object',
        properties: {
          test_prop: {type: 'string'},
        },
      },
    });
  }

  async checkConnection(_: AirbyteConfig): Promise<[boolean, VError]> {
    if (this.shouldCheckSucceed) {
      return [true, undefined];
    }
    return [false, new VError('Connection check failed')];
  }

  streams(): AirbyteStreamBase[] {
    return [new TestStream(this.logger)];
  }
}

describe('AirbyteSourceRunner - check_connection flag', () => {
  let tempDir: string;
  let configPath: string;
  let catalogPath: string;

  beforeEach(() => {
    // Create temporary directory and files for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-runner-test-'));

    const catalog: AirbyteConfiguredCatalog = {
      streams: [
        {
          stream: {
            name: 'test_stream',
            json_schema: {},
            supported_sync_modes: [SyncMode.FULL_REFRESH],
          },
          sync_mode: SyncMode.FULL_REFRESH,
        },
      ],
    };

    catalogPath = path.join(tempDir, 'catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  describe('CHECK command', () => {
    it('should perform check when check_connection is true (default)', async () => {
      const config = {test_prop: 'value', check_connection: true};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, true);
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      logger.write = (msg: any) => messages.push(msg);

      const checkCmd = runner.checkCommand();
      await checkCmd.parseAsync(['--config', configPath], {from: 'user'});

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(AirbyteMessageType.CONNECTION_STATUS);
      expect(messages[0].connectionStatus.status).toBe(
        AirbyteConnectionStatus.SUCCEEDED
      );
    });

    it('should perform check when check_connection is undefined (default)', async () => {
      const config = {test_prop: 'value'}; // check_connection not set
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, true);
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      logger.write = (msg: any) => messages.push(msg);

      const checkCmd = runner.checkCommand();
      await checkCmd.parseAsync(['--config', configPath], {from: 'user'});

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(AirbyteMessageType.CONNECTION_STATUS);
      expect(messages[0].connectionStatus.status).toBe(
        AirbyteConnectionStatus.SUCCEEDED
      );
    });

    it('should skip check when check_connection is false', async () => {
      const config = {test_prop: 'value', check_connection: false};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, false); // Would fail if actually checked
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      const logMessages: string[] = [];
      logger.write = (msg: any) => messages.push(msg);
      logger.info = (msg: string) => logMessages.push(msg);

      const checkCmd = runner.checkCommand();
      await checkCmd.parseAsync(['--config', configPath], {from: 'user'});

      // Should return success without actually checking
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(AirbyteMessageType.CONNECTION_STATUS);
      expect(messages[0].connectionStatus.status).toBe(
        AirbyteConnectionStatus.SUCCEEDED
      );
      expect(messages[0].connectionStatus.message).toContain(
        'Setup-time check skipped'
      );

      // Should log that check is being skipped
      expect(logMessages.some((msg) => msg.includes('Skipping'))).toBe(true);
    });
  });

  describe('READ command with pre-read check', () => {
    it('should call onBeforeRead before pre-read check', async () => {
      const config = {test_prop: 'value'};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      let onBeforeReadCalled = false;
      let checkConnectionCalled = false;
      let onBeforeReadCalledFirst = false;

      // Override source methods to track call order
      const source = new TestSource(logger, true);
      const originalOnBeforeRead = source.onBeforeRead.bind(source);
      const originalCheckConnection = source.checkConnection.bind(source);

      source.onBeforeRead = async (config, catalog, state) => {
        onBeforeReadCalled = true;
        if (!checkConnectionCalled) {
          onBeforeReadCalledFirst = true;
        }
        return originalOnBeforeRead(config, catalog, state);
      };

      source.checkConnection = async (config) => {
        checkConnectionCalled = true;
        return originalCheckConnection(config);
      };

      const runner = new AirbyteSourceRunner(logger, source);
      const messages: any[] = [];
      logger.write = (msg: any) => messages.push(msg);

      const readCmd = runner.readCommand();
      await readCmd.parseAsync(['--config', configPath, '--catalog', catalogPath], {
        from: 'user',
      });

      // Verify onBeforeRead was called before checkConnection
      expect(onBeforeReadCalled).toBe(true);
      expect(checkConnectionCalled).toBe(true);
      expect(onBeforeReadCalledFirst).toBe(true);
    });

    it('should always perform pre-read check when check_connection is true', async () => {
      const config = {test_prop: 'value', check_connection: true};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, true);
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      const logMessages: string[] = [];
      logger.write = (msg: any) => messages.push(msg);
      logger.info = (msg: string) => logMessages.push(msg);

      const readCmd = runner.readCommand();
      await readCmd.parseAsync(['--config', configPath, '--catalog', catalogPath], {
        from: 'user',
      });

      // Should always contain pre-read validation log messages
      expect(
        logMessages.some((msg) => msg.includes('Performing pre-read connection validation'))
      ).toBe(true);
      expect(
        logMessages.some((msg) => msg.includes('Pre-read connection validation succeeded'))
      ).toBe(true);
    });

    it('should always perform pre-read check when check_connection is undefined', async () => {
      const config = {test_prop: 'value'}; // check_connection not set
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, true);
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      const logMessages: string[] = [];
      logger.write = (msg: any) => messages.push(msg);
      logger.info = (msg: string) => logMessages.push(msg);

      const readCmd = runner.readCommand();
      await readCmd.parseAsync(['--config', configPath, '--catalog', catalogPath], {
        from: 'user',
      });

      // Should always contain pre-read validation log messages
      expect(
        logMessages.some((msg) => msg.includes('Performing pre-read connection validation'))
      ).toBe(true);
      expect(
        logMessages.some((msg) => msg.includes('Pre-read connection validation succeeded'))
      ).toBe(true);
    });

    it('should always perform pre-read check and succeed', async () => {
      const config = {test_prop: 'value', check_connection: false};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, true); // Check will succeed
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      const logMessages: string[] = [];
      logger.write = (msg: any) => messages.push(msg);
      logger.info = (msg: string) => logMessages.push(msg);

      const readCmd = runner.readCommand();
      await readCmd.parseAsync(['--config', configPath, '--catalog', catalogPath], {
        from: 'user',
      });

      // Should always contain pre-read validation log messages
      expect(
        logMessages.some((msg) =>
          msg.includes('Performing pre-read connection validation')
        )
      ).toBe(true);
      expect(
        logMessages.some((msg) =>
          msg.includes('Pre-read connection validation succeeded')
        )
      ).toBe(true);

      // Should have processed records successfully
      const records = messages.filter(
        (msg) => msg.type === AirbyteMessageType.RECORD
      );
      expect(records.length).toBeGreaterThan(0);
    });

    it('should always perform pre-read check and fail fast on error', async () => {
      const config = {test_prop: 'value', check_connection: false};
      configPath = path.join(tempDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config));

      const logger = new AirbyteSourceLogger();
      const source = new TestSource(logger, false); // Check will fail
      const runner = new AirbyteSourceRunner(logger, source);

      const messages: any[] = [];
      const logMessages: string[] = [];
      const errorMessages: string[] = [];
      logger.write = (msg: any) => messages.push(msg);
      logger.info = (msg: string) => logMessages.push(msg);
      logger.error = (msg: string) => errorMessages.push(msg);
      logger.flush = () => {};

      const readCmd = runner.readCommand();

      // Should throw an error
      await expect(
        readCmd.parseAsync(['--config', configPath, '--catalog', catalogPath], {
          from: 'user',
        })
      ).rejects.toThrow(/Pre-read connection check failed/);

      // Should contain pre-read validation log messages
      expect(
        logMessages.some((msg) =>
          msg.includes('Performing pre-read connection validation')
        )
      ).toBe(true);

      // Should contain error messages
      expect(
        errorMessages.some((msg) => msg.includes('Pre-read connection check failed'))
      ).toBe(true);

      // Should have written connection status message
      const statusMessages = messages.filter(
        (msg) => msg.type === AirbyteMessageType.CONNECTION_STATUS
      );
      expect(statusMessages).toHaveLength(1);
      expect(statusMessages[0].connectionStatus.status).toBe(
        AirbyteConnectionStatus.FAILED
      );

      // Should NOT have processed any records (fail-fast)
      const records = messages.filter(
        (msg) => msg.type === AirbyteMessageType.RECORD
      );
      expect(records).toHaveLength(0);
    });
  });
});
