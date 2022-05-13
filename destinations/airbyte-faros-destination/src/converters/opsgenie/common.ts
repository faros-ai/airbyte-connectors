import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

const MAX_DESCRIPTION_LENGTH = 1000;
interface OpsGenieConfig {
  application_mapping?: ApplicationMapping;
  // Max length for free-form description text fields such as incident description
  max_description_length?: number;
}
/** Opsgenie converter base */
export abstract class OpsGenieConverter extends Converter {
  source = 'OpsGenie';
  /** Almost every Opsgenie record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected opsgenieConfig(ctx: StreamContext): OpsGenieConfig {
    return ctx.config.source_specific_configs?.opsgenie ?? {};
  }

  protected maxDescriptionLength(ctx: StreamContext): number {
    return (
      this.opsgenieConfig(ctx).max_description_length ?? MAX_DESCRIPTION_LENGTH
    );
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.opsgenieConfig(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }
}
