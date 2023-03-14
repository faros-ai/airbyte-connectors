import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {keyBy} from 'lodash';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {User} from './models';
const DEFAULT_VERSION = 'v1';

export interface BambooHRConfig {
  readonly api_key: string;
  readonly domain: string;
  readonly version?: string;
  readonly additional_fields?: ReadonlyArray<string>;
  readonly departments?: ReadonlyArray<string>;
}

interface Field {
  id: string;
  name: string;
  type: string;
  alias?: string;
}

const DEFAULT_FIELD_ALIASES =
  'acaStatus,caStatusCategory,address1,address2,age,bestEmail,birthday,bonusAmount,bonusComment,bonusDate,bonusReason,city,commissionAmount,commissionComment,commissionDate,commisionDate,country,createdByUserId,dateOfBirth,department,division,eeo,employeeNumber,employmentHistoryStatus,ethnicity,exempt,firstName,flsaCode,fullName1,fullName2,fullName3,fullName4,fullName5,displayName,gender,hireDate,originalHireDate,homeEmail,homePhone,id,isPhotoUploaded,jobTitle,lastChanged,lastName,location,maritalStatus,middleName,mobilePhone,nationalId,nationality,nin,payChangeReason,payGroup,payGroupId,payRate,payRateEffectiveDate,payType,paidPer,paySchedule,payScheduleId,payFrequency,includeInPayroll,timeTrackingEnabled,preferredName,ssn,sin,standardHoursPerWeek,state,stateCode,status,supervisor,supervisorId,supervisorEId,supervisorEmail,terminationDate,workEmail,workPhone,workPhonePlusExtension,workPhoneExtension,zipcode';

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
      throw new VError('api_key cannot be empty');
    }

    if (!config.domain) {
      throw new VError('domain cannot be empty');
    }

    const version = config.version ?? DEFAULT_VERSION;
    const httpClient = axios.create({
      baseURL: `https://${config.api_key}:x@api.bamboohr.com/api/gateway.php/${config.domain}/${version}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity,
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
      let errorMessage = 'Please verify your api_key is correct. Error: ';
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

  async getFieldsByAlias(): Promise<Dictionary<Field>> {
    const resp = await this.httpClient.get<any>(`/meta/fields`);
    const fields: ReadonlyArray<Field> = resp.data;
    return keyBy(
      fields.filter((f) => f.alias),
      (f) => f.alias
    );
  }

  async *getUsers(
    departments: ReadonlySet<string> = new Set(),
    additionalFields: ReadonlyArray<string> = []
  ): AsyncGenerator<User> {
    const additionalAliases = [];
    if (additionalFields?.length > 0) {
      const fields = await this.getFieldsByAlias();
      for (const name of additionalFields) {
        if (!(name in fields)) {
          throw new VError(
            `Could not find field alias for additional field ${name}`
          );
        }
        additionalAliases.push(fields[name].alias);
      }
    }
    const fieldsToFetch = [DEFAULT_FIELD_ALIASES, additionalAliases].join(',');
    const users = await this.httpClient.get<any>(`/meta/users`);
    for (const value of Object.values(users.data)) {
      const employeeId = value['employeeId'];
      const user = await this.httpClient.get<any>(
        `/employees/${employeeId}/?fields=${fieldsToFetch}`,
        {
          validateStatus: (status) => status === 200 || status === 404,
        }
      );
      if (user.status == 200) {
        if (departments.size === 0 || departments.has(user.data.department)) {
          yield user.data as User;
        }
      } else {
        this.logger.warn(
          `Could not fetch info for employee id ${employeeId}: employee not found`
        );
      }
    }
  }
}
