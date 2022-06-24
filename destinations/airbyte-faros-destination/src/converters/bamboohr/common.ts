import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

export interface BambooHRConfig {
  bootstrap_teams_from_managers?: boolean;
}

/** BambooHR converter base */
export abstract class BambooHRConverter extends Converter {
  source = 'BambooHR';
  /** Almost every BambooHR record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected bamboohrConfig(ctx: StreamContext): BambooHRConfig {
    return ctx.config.source_specific_configs?.bamboohr ?? {};
  }

  protected bootstrapTeamsFromManagers(ctx: StreamContext): boolean {
    return this.bamboohrConfig(ctx).bootstrap_teams_from_managers ?? false;
  }
}
