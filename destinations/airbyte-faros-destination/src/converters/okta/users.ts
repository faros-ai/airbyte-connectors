import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Customreports} from '../workday/customreports';
import {EmployeeRecord} from '../workday/models';
import {OktaConverter} from './common';
import {User} from './models';

type ColumnNameMapping = {
  start_date_column_name?: string;
  full_name_column_name?: string;
  first_name_column_name?: string;
  last_name_column_name?: string;
  employee_id_column_name?: string;
  manager_name_column_name?: string;
  manager_id_column_name?: string;
  team_id_column_name?: string;
  team_name_column_name?: string;
  termination_date_column_name?: string;
  location_column_name?: string;
  email_column_name?: string;
  employee_type_column_name?: string;
};

export interface OktaConfig {
  column_names_mapping?: ColumnNameMapping;
}

export class Users extends OktaConverter {
  private workdayConverter = new Customreports();
  private _config: OktaConfig = undefined;

  private initialize(ctx: StreamContext): void {
    this._config =
      this._config ?? ctx.config.source_specific_configs?.okta ?? {};
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.workdayConverter.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);
    const rec = record.record.data as User;
    const profile = rec.profile;

    const startDate =
      profile[this._config.column_names_mapping.start_date_column_name];
    const fullName =
      profile[this._config.column_names_mapping.full_name_column_name];
    const firstName =
      profile[this._config.column_names_mapping.first_name_column_name];
    const lastName =
      profile[this._config.column_names_mapping.last_name_column_name];
    const employeeId =
      profile[this._config.column_names_mapping.employee_id_column_name];
    const managerName =
      profile[this._config.column_names_mapping.manager_name_column_name];
    const managerId =
      profile[this._config.column_names_mapping.manager_id_column_name];
    const teamId =
      profile[this._config.column_names_mapping.team_id_column_name];
    const teamName =
      profile[this._config.column_names_mapping.team_name_column_name];
    const terminationDate =
      profile[this._config.column_names_mapping.termination_date_column_name];
    const location =
      profile[this._config.column_names_mapping.location_column_name];
    const email = profile[this._config.column_names_mapping.email_column_name];
    const employeeType =
      profile[this._config.column_names_mapping.employee_type_column_name];

    const asWorkdayRecord: EmployeeRecord = {
      Start_Date: startDate,
      Full_Name: fullName ?? `${firstName} ${lastName}`,
      Employee_ID: employeeId,
      Manager_Name: managerName,
      Manager_ID: managerId,
      Team_ID: teamId,
      Team_Name: teamName,
      Termination_Date: terminationDate,
      Location: location,
      Email: email,
      Employee_Type: employeeType,
    };

    record.record.data = asWorkdayRecord;
    return this.workdayConverter.convert(record, ctx);
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.workdayConverter.onProcessingComplete(ctx);
  }
}
