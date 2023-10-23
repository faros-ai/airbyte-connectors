import {AirbyteRecord} from 'faros-airbyte-cdk';

import {AbstractSurveys} from '../abstract-surveys/surveys';

export class Surveys extends AbstractSurveys {
  source = 'Sheets';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getSubmittedAt(record: AirbyteRecord): string | undefined {
    const submittedAtColumnName =
      this.config.column_names_mapping.response_submitted_at_column_name;
    return record?.record?.data?.row[submittedAtColumnName];
  }

  getSurveyId(record: AirbyteRecord): string | undefined {
    return record.record.data.sheetId;
  }

  getTableName(record: AirbyteRecord): string | undefined {
    return record.record.data.sheetName;
  }
}
