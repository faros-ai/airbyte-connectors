import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface AzuregitConfig {
  application_mapping?: ApplicationMapping;
}

/** Azuregit converter base */
export abstract class AzuregitConverter extends Converter {
  /** Almost every Azuregit record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getOrganizationFromUrl(url: string): string {
    return url.split('/')[3];
  }
}
