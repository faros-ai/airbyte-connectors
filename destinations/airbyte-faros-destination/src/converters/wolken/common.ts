import {Converter, parseObjectConfig, StreamContext} from '../converter';
import {ApplicationMapping} from '../common/ims';
import {ConfigurationItem, FlexField} from 'faros-airbyte-common/wolken';
import {Common, ComputeApplication} from '../common/common';

interface WolkenConfig {
  service_id_flex_id: number;
  jira_project_key_flex_id?: number;
  application_tag_flex_ids?: number[];
  project_tag_flex_ids?: number[];
  path_hierarchy_flex_ids?: number[];
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

  protected getApplication(
    configurationItem: ConfigurationItem,
    ctx: StreamContext,
  ): ComputeApplication | undefined {
    const serviceIdFlexId = this.config(ctx).service_id_flex_id;
    const serviceId = WolkenConverter.getFlexField(configurationItem, serviceIdFlexId)?.flexValue;

    if (!serviceId) {
      return undefined;
    }

    const applicationMapping = this.applicationMapping(ctx);
    let application = Common.computeApplication(serviceId, 'unknown');

    if (serviceId in applicationMapping && applicationMapping[serviceId].name) {
      const mappedApp = applicationMapping[serviceId];
      application = Common.computeApplication(
        mappedApp.name,
        mappedApp.platform ?? application.platform
      );
    }

    return application;
  }

  static getFlexField(configurationItem: ConfigurationItem, flexId: number): FlexField | undefined {
    return configurationItem.flexFields?.find(f => f.flexId === flexId);
  }
}
