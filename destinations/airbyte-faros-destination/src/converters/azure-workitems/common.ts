import {AirbyteRecord} from '../../../../../faros-airbyte-cdk/lib';
import {Converter} from '../converter';

/** AzureWorkitems converter base */
export abstract class AzureWorkitemsConverter extends Converter {
  source = 'Azure-Workitems';
  /** Almost every AzureWorkitems record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getOrganizationFromUrl(url: string): string {
    console.log('============> URL to Split: ', url, ' <============');
    return url.split('/')[3];
  }
}
