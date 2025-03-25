import {ConfigurationItem, FlexField} from 'faros-airbyte-common/wolken';

import {Common, ComputeApplication} from '../common/common';
import {ApplicationMapping} from '../common/ims';
import {Converter, parseObjectConfig, StreamContext} from '../converter';

// key: user property display name
// value: user property jsonata path
// e.g. {"Department": "userAddress.departmentName"}
type UserLookupExtraFieldsMapping = Record<string, string>;

interface WolkenConfig {
  service_id_flex_field_name: string;
  jira_project_key_flex_field_name?: string;
  application_tag_flex_field_names?: string[];
  application_tag_flex_field_user_lookup_names?: string[];
  project_tag_flex_field_names?: string[];
  path_hierarchy_flex_field_names?: string[];
  application_mapping?: ApplicationMapping;
  user_lookup_extra_fields_mapping?: UserLookupExtraFieldsMapping;
  store_current_incidents_associations?: boolean;
}

export abstract class WolkenConverter extends Converter {
  source = 'Wolken';

  protected config(ctx: StreamContext): WolkenConfig {
    return ctx.config.source_specific_configs?.wolken ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected userLookupExtraFieldsMapping(
    ctx: StreamContext
  ): UserLookupExtraFieldsMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.user_lookup_extra_fields_mapping,
        'User Lookup Extra Fields Mapping'
      ) ?? {}
    );
  }

  protected onlyStoreCurrentIncidentsAssociations(ctx: StreamContext): boolean {
    return this.config(ctx).store_current_incidents_associations ?? false;
  }

  protected getApplication(
    configurationItem: ConfigurationItem,
    ctx: StreamContext
  ): ComputeApplication | undefined {
    const serviceIdFlexFieldName = this.config(ctx).service_id_flex_field_name;
    const serviceId = WolkenConverter.getFlexField(
      configurationItem,
      serviceIdFlexFieldName
    )?.flexValue;

    if (!serviceId) {
      return undefined;
    }

    const applicationMapping = this.applicationMapping(ctx);
    let application = Common.computeApplication(serviceId, serviceId);

    if (serviceId in applicationMapping && applicationMapping[serviceId].name) {
      const mappedApp = applicationMapping[serviceId];
      application = Common.computeApplication(
        mappedApp.name,
        mappedApp.platform ?? application.platform
      );
    }

    return application;
  }

  static getFlexField(
    configurationItem: ConfigurationItem,
    flexName: string
  ): FlexField | undefined {
    return configurationItem.flexFields?.find((f) => f.flexName === flexName);
  }
}
