import {createHash} from 'crypto';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class AirtableConverter extends Converter {
  source = 'Airtable';

  id(record: AirbyteRecord): any {
    return record?.record?.data?._airtable_id;
  }

  static getTeamUid(teamName: string): string | undefined {
    if (!teamName) {
      return undefined;
    }

    return teamName.toLowerCase().split(' ').join('_');
  }

  static getSurveyId(fqTableId: string): string {
    // Get the first part of the fully qualified table id, which corresponds to the Airtable base id
    // E.g., appwVNmuUAPCIxzSZ/tblWFFSCLxi0gVtkU -> appwVNmuUAPCIxzSZ
    return fqTableId.split('/')[0];
  }

  static createQuestionUid(question: string, surveyId: string) {
    return `${surveyId}-${createHash('sha256').update(question).digest('hex')}`;
  }
}
