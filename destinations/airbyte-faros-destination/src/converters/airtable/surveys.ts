import {AirbyteRecord} from 'faros-airbyte-cdk';

import {AbstractSurveys} from '../abstract-surveys/surveys';

export class Surveys extends AbstractSurveys {
  source = 'Airtable';

  id(record: AirbyteRecord): any {
    return record?.record?.data?._airtable_id;
  }

  static getBaseId(fqTableId: string): string {
    // Get the first part of the fully qualified table id, which corresponds to the Airtable base id
    // E.g., appwVNmuUAPCIxzSZ/tblWFFSCLxi0gVtkU -> appwVNmuUAPCIxzSZ
    return fqTableId.split('/')[0];
  }

  static getTableName(fqTableName: string): string {
    // Get the second part of the fully qualified table name, which corresponds to the table name
    // E.g., my_surveys/Survey Responses => Survey Responses
    return fqTableName.split('/')[1];
  }

  getSurveyId(record: AirbyteRecord): string | undefined {
    const fqTableId: string = record?.record?.data?._airtable_table_id;
    if (!fqTableId) {
      return undefined;
    }

    return Surveys.getBaseId(fqTableId);
  }

  getTableName(record: AirbyteRecord): string | undefined {
    const fqTableName: string = record?.record?.data?._airtable_table_name;
    if (!fqTableName) {
      return undefined;
    }

    return Surveys.getTableName(fqTableName);
  }

  getSubmittedAt(record: AirbyteRecord): string | undefined {
    return (
      super.getSubmittedAt(record) ??
      record?.record?.data?._airtable_created_time
    );
  }
}
