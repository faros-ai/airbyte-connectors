import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {User} from './models';
const DEFAULT_VERSION = 'v1';

export interface BambooHRConfig {
  readonly api_key: string;
  readonly domain: string;
  readonly version?: string;
}

export class BambooHR {
  private static bambooHR: BambooHR = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: BambooHRConfig,
    logger: AirbyteLogger
  ): Promise<BambooHR> {
    if (BambooHR.bambooHR) return BambooHR.bambooHR;

    if (!config.api_key) {
      throw new VError('api_key must be a not empty string');
    }

    if (!config.domain) {
      throw new VError('domain must be a not empty string');
    }

    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `https://${config.api_key}:x@api.bamboohr.com/api/gateway.php/${config.domain}/${version}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: 500000,
      headers: {
        Accept: `application/json`,
        'Content-Type': `application/json`,
      },
    });
    BambooHR.bambooHR = new BambooHR(httpClient, logger);
    return BambooHR.bambooHR;
  }
  async checkConnection(): Promise<void> {
    try {
      const iter = this.getUsers();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your apiKey is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }
  async *getUsers(): AsyncGenerator<User> {
    try {
      const users = await this.httpClient.get<any>(`/meta/users`);
      for (const [key, value] of Object.entries(users.data)) {
        const user = await this.httpClient.get<any>(
          `/employees/${value['employeeId']}/?fields=employeeNumber,jobTitle,status,employmentHistoryStatus,address1,address2,birthday,bestEmail,workEmail,workPhone,city,country,department,ethnicity,firstName,lastName,gender,middleName,mobilePhone,zipcode,hireDate,supervisor,payRate,bonusAmount,commissionAmount,payFrequency,hireDate,supervisor,supervisorId,payGroup`
        );
        yield user.data as User;
      }
    } catch (error) {
      this.logger.error(error.toString());
    }
  }
}
