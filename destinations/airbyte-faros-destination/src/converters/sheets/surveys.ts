import {AirbyteRecord} from 'faros-airbyte-cdk';

import {AbstractSurveys} from '../abstract-surveys/surveys';

export class Surveys extends AbstractSurveys {
  source = 'Sheets';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getSurveyId(record: AirbyteRecord): string | undefined {
    return record.record.data.sheetId;
  }

  getTableName(record: AirbyteRecord): string | undefined {
    return record.record.data.sheetName;
  }
}
