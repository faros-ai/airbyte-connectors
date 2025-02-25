import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ConfigurationItem, Incident} from 'faros-airbyte-common/wolken';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {FLUSH} from '../../common/types';
import {ComputeApplication} from '../common/common';
import {
  IncidentPriorityCategory,
  IncidentSeverityCategory,
  IncidentStatusCategory,
} from '../common/ims';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {WolkenConverter} from './common';

export class Incidents extends WolkenConverter {
  static readonly configurationItemsStream = new StreamName(
    'wolken',
    'configuration_items'
  );

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Incidents.configurationItemsStream];
  }

  private readonly incidentCI: Map<string, Set<number>> = new Map();
  private readonly resolvedApplicationsByCI = new Map<
    number,
    ComputeApplication | undefined
  >();

  id(record: AirbyteRecord) {
    return record?.record?.data?.ticketId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_Tag',
    'ims_Incident',
    'ims_IncidentAssignment',
    'ims_IncidentApplicationImpact',
    'ims_IncidentTagV2',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const incident = record.record.data as Incident;

    const incidentKey = {
      uid: incident.ticketId.toString(),
      source,
    };

    const res = [];

    res.push({
      model: 'ims_Incident',
      record: {
        ...incidentKey,
        title: incident.subject,
        description:
          typeof incident.description === 'string'
            ? Utils.cleanAndTruncate(incident.description)
            : null,
        severity: this.getSeverity(incident.impactName) ?? null,
        priority: this.getPriority(incident.priorityName) ?? null,
        status: this.getStatus(incident.statusName) ?? null,
        createdAt: Utils.toDate(incident.createdTime) ?? null,
        updatedAt: Utils.toDate(incident.updatedTimestamp) ?? null,
        resolvedAt: Utils.toDate(incident.resolutionTimeStamp) ?? null,
      },
    });

    res.push(
      ...this.incidentTag(incidentKey, 'Category', incident.categoryName),
      ...this.incidentTag(incidentKey, 'Subcategory', incident.subCategoryName)
    );

    const assigneeUid = incident.assignedUserId;
    if (assigneeUid) {
      res.push({
        model: 'ims_IncidentAssignment',
        record: {
          incident: incidentKey,
          assignee: {
            uid: assigneeUid.toString(),
            source,
          },
        },
      });
    }

    if (!this.incidentCI.has(incidentKey.uid)) {
      this.incidentCI.set(incidentKey.uid, new Set());
    }

    for (const ci of incident.ciRequestList ?? []) {
      this.incidentCI.get(incidentKey.uid).add(ci.ciId);
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res = [];
    if (this.onlyStoreCurrentIncidentsAssociations(ctx)) {
      res.push(
        ...Array.from(this.incidentCI.keys()).map((incidentKeyStr) => ({
          model: 'ims_IncidentApplicationImpact__Deletion',
          record: {
            flushRequired: false,
            where: {
              incident: {
                uid: incidentKeyStr,
                source: this.source,
              },
            },
          },
        })),
        FLUSH
      );
    }

    for (const [incidentKeyStr, ciIds] of this.incidentCI.entries()) {
      for (const ciId of ciIds) {
        const application = this.getApplicationFromCI(ciId, ctx);
        if (!application) {
          continue;
        }

        res.push({
          model: 'ims_IncidentApplicationImpact',
          record: {
            incident: {
              uid: incidentKeyStr,
              source: this.source,
            },
            application,
          },
        });
      }
    }

    return res;
  }

  private getApplicationFromCI(
    ciId: number,
    ctx: StreamContext
  ): ComputeApplication | undefined {
    if (this.resolvedApplicationsByCI.has(ciId)) {
      return this.resolvedApplicationsByCI.get(ciId);
    }
    const ci = ctx.get(
      Incidents.configurationItemsStream.asString,
      ciId.toString()
    );
    if (!ci) {
      this.resolvedApplicationsByCI.set(ciId, undefined);
      return undefined;
    }
    const application = this.getApplication(
      ci.record.data as ConfigurationItem,
      ctx
    );
    this.resolvedApplicationsByCI.set(ciId, application);
    return application;
  }

  private getSeverity(
    impactName?: string
  ): {category: IncidentSeverityCategory; detail: string} | undefined {
    if (!isNil(impactName)) {
      return Utils.toCategoryDetail(IncidentSeverityCategory, impactName, {
        High: IncidentSeverityCategory.Sev1,
        Medium: IncidentSeverityCategory.Sev3,
        Low: IncidentSeverityCategory.Sev5,
      });
    }
    return undefined;
  }

  private getPriority(
    priorityName?: string
  ): {category: IncidentPriorityCategory; detail: string} | undefined {
    if (!isNil(priorityName)) {
      return Utils.toCategoryDetail(IncidentPriorityCategory, priorityName, {
        'Critical - P1': IncidentPriorityCategory.Critical,
        'High - P2': IncidentPriorityCategory.High,
        'Medium - P3': IncidentPriorityCategory.Medium,
        'Low - P4': IncidentPriorityCategory.Low,
      });
    }
    return undefined;
  }

  private getStatus(
    statusName?: string
  ): {category: IncidentStatusCategory; detail: string} | undefined {
    if (!isNil(statusName)) {
      return Utils.toCategoryDetail(IncidentStatusCategory, statusName, {
        Closed: IncidentStatusCategory.Resolved,
        'In Progress': IncidentStatusCategory.Investigating,
        Open: IncidentStatusCategory.Created,
        Reopen: IncidentStatusCategory.Identified,
        Resolved: IncidentStatusCategory.Resolved,
        Waiting: IncidentStatusCategory.Identified,
      });
    }
    return undefined;
  }

  private incidentTag(
    incidentKey: {uid: string; source: string},
    key: string,
    value: string
  ): ReadonlyArray<DestinationRecord> {
    if (!value) {
      return [];
    }
    const tagKey = {
      uid: `${key}__${value}`,
    };
    return [
      {
        model: 'faros_Tag',
        record: {
          ...tagKey,
          key,
          value,
        },
      },
      {
        model: 'ims_IncidentTagV2',
        record: {
          incident: incidentKey,
          tag: tagKey,
        },
      },
    ];
  }
}
