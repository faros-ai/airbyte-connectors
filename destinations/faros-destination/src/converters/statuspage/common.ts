import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';
export {IncidentStatus, Component, IncidentImpact} from 'statuspage.io';

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface StatuspageConfig {
  application_mapping?: ApplicationMapping;
}

export enum ComponentStatus {
  degraded_performance = 'degraded_performance',
  major_outage = 'major_outage',
  operational = 'operational',
  partial_outage = 'partial_outage',
  under_maintenance = 'under_maintenance',
}

export enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentEventType {
  category: IncidentEventTypeCategory;
  detail: string;
}

export enum IncidentStatusCategory {
  Identified = 'Identified',
  Investigating = 'Investigating',
  Monitoring = 'Monitoring',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export interface IncidentPriority {
  category: IncidentPriorityCategory;
  detail: string;
}

export enum IncidentPriorityCategory {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Custom = 'Custom',
}

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

export interface IncidentSeverity {
  category: IncidentSeverityCategory;
  detail: string;
}

/** StatusPage converter base */
export abstract class StatuspageConverter extends Converter {
  /** Every StatusPage record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected statuspageConfig(ctx: StreamContext): StatuspageConfig {
    return ctx.config.source_specific_configs?.statuspage ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return this.statuspageConfig(ctx).application_mapping ?? {};
  }
}
