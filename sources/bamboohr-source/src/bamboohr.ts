import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
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
      throw new VError('api_key cannot be an empty string');
    }

    if (!config.domain) {
      throw new VError('domain cannot be an empty string');
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
          `/employees/${value['employeeId']}/?fields=acaStatus,caStatusCategory,address1,address2,age,bestEmail,birthday,bonusAmount,bonusComment,bonusDate,bonusReason,city,commissionAmount,commissionComment,commissionDate,commisionDate,country,createdByUserId,dateOfBirth,department,division,eeo,employeeNumber,employmentHistoryStatus,ethnicity,exempt,firstName,flsaCode,fullName1,fullName2,fullName3,fullName4,fullName5,displayName,gender,hireDate,originalHireDate,homeEmail,homePhone,id,isPhotoUploaded,jobTitle,lastChanged,lastName,location,maritalStatus,middleName,mobilePhone,nationalId,nationality,nin,payChangeReason,payGroup,payGroupId,payRate,payRateEffectiveDate,payType,paidPer,paySchedule,payScheduleId,payFrequency,includeInPayroll,timeTrackingEnabled,preferredName,ssn,sin,standardHoursPerWeek,state,stateCode,status,supervisor,supervisorId,supervisorEId,supervisorEmail,terminationDate,workEmail,workPhone,workPhonePlusExtension,workPhoneExtension,zipcode`
        );
        if (user.status == 200) yield user.data as User;
      }
    } catch (error) {
      this.logger.error(error.toString());
    }
  }
}
