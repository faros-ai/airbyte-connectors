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

    return AirtableConverter.digest(teamName);
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

  static digest(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
