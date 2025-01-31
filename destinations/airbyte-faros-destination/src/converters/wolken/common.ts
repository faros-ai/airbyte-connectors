import {Converter, parseObjectConfig, StreamContext} from '../converter';
import {ApplicationMapping} from '../common/ims';

interface WolkenConfig {
  application_mapping?: ApplicationMapping;
  store_current_incidents_associations?: boolean;
}

export abstract class WolkenConverter extends Converter {
  source = 'Wolken';

  protected config(ctx: StreamContext): WolkenConfig {
    return ctx.config.source_specific_configs?.wolken ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return parseObjectConfig(
      this.config(ctx)?.application_mapping,
      'Application Mapping'
    ) ?? {};
  }

  protected onlyStoreCurrentIncidentsAssociations(ctx: StreamContext): boolean {
    return this.config(ctx).store_current_incidents_associations ?? false;
  }
}
