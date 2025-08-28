import {AirbyteSourceLogger} from 'faros-airbyte-cdk';

import {ReportParam, WorkdayConfig} from '../src/index';
import {ccxUrl, Workday} from '../src/workday';

describe('ccxUrl', () => {
  it('should return the correct URL', () => {
    const postCxxPath = '/api/data';
    const baseUrl = 'https://example.com';

    const result = ccxUrl(postCxxPath, baseUrl);

    expect(result).toBe('https://example.com/ccx/api/data');
  });

  it('should return the correct URL with a trailing slash', () => {
    const postCxxPath = '/api/data';
    const baseUrl = 'https://example.com/';

    const result = ccxUrl(postCxxPath, baseUrl);

    expect(result).toBe('https://example.com/ccx/api/data');
  });
});

describe('customReports with reportParams', () => {
  let workday: Workday;
  let mockConfig: WorkdayConfig;
  let logger: AirbyteSourceLogger;

  beforeEach(async () => {
    logger = new AirbyteSourceLogger();
    mockConfig = {
      tenant: 'test-tenant',
      baseUrl: 'https://test.workday.com',
      credentials: {
        username: 'test-user',
        password: 'test-pass',
      },
    };

    workday = await Workday.instance(mockConfig, logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call API with default parameters when no reportParams provided', async () => {
    const getSpy = jest.spyOn((workday as any).api, 'get');
    getSpy.mockResolvedValue({
      data: 'id,name\n1,John',
    });

    const generator = workday.customReports('test-report', 'csv');
    
    // Consume the generator to trigger the API call
    const results = [];
    for await (const record of generator) {
      results.push(record);
    }

    expect(getSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ccx/service/customreport2/test-tenant/test-report'),
      {
        params: {
          format: 'json',
        },
      }
    );
  });

  it('should merge reportParams with base parameters', async () => {
    const getSpy = jest.spyOn((workday as any).api, 'get');
    getSpy.mockResolvedValue({
      data: 'id,name\n1,John',
    });

    const reportParams: ReportParam[] = [
      {name: 'startDate', value: '2023-01-01'},
      {name: 'endDate', value: '2023-12-31'},
    ];

    const generator = workday.customReports('test-report', 'csv', reportParams);
    
    // Consume the generator to trigger the API call
    const results = [];
    for await (const record of generator) {
      results.push(record);
    }

    expect(getSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ccx/service/customreport2/test-tenant/test-report'),
      {
        params: {
          format: 'json',
          startDate: '2023-01-01',
          endDate: '2023-12-31',
        },
      }
    );
  });

  it('should handle empty reportParams array', async () => {
    const getSpy = jest.spyOn((workday as any).api, 'get');
    getSpy.mockResolvedValue({
      data: 'id,name\n1,John',
    });

    const reportParams: ReportParam[] = [];

    const generator = workday.customReports('test-report', 'csv', reportParams);
    
    // Consume the generator to trigger the API call
    const results = [];
    for await (const record of generator) {
      results.push(record);
    }

    expect(getSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ccx/service/customreport2/test-tenant/test-report'),
      {
        params: {
          format: 'json',
        },
      }
    );
  });

  it('should handle duplicate parameter names with last-wins strategy', async () => {
    const getSpy = jest.spyOn((workday as any).api, 'get');
    getSpy.mockResolvedValue({
      data: 'id,name\n1,John',
    });

    const reportParams: ReportParam[] = [
      {name: 'format', value: 'xml'}, // Should be overwritten by base format
      {name: 'limit', value: '10'},
      {name: 'limit', value: '20'}, // This should win
    ];

    const generator = workday.customReports('test-report', 'csv', reportParams);
    
    // Consume the generator to trigger the API call
    const results = [];
    for await (const record of generator) {
      results.push(record);
    }

    expect(getSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ccx/service/customreport2/test-tenant/test-report'),
      {
        params: {
          format: 'xml', // User param overwrote base format
          limit: '20', // Last duplicate wins
        },
      }
    );
  });
});
