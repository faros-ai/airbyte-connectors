import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext, StreamName} from '../converter';
import {
  IncidentPriorityCategory,
  IncidentStatusCategory,
} from '../common/ims';
import {ConfigurationItem, Incident} from 'faros-airbyte-common/wolken';
import {WolkenConverter} from './common';
import {FLUSH} from '../../common/types';
import {ComputeApplication} from '../common/common';


export class Incidents extends WolkenConverter {
  static readonly configurationItemsStream = new StreamName('wolken', 'configuration_items');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Incidents.configurationItemsStream];
  }

  private incidentCI: Map<string, Set<number>> = new Map();

  id(record: AirbyteRecord) {
    return record?.record?.data?.ticketId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Incident',
    'ims_IncidentAssignment',
    'ims_IncidentApplicationImpact',
  ];

  async convert(
    record: AirbyteRecord,
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
        description: Utils.cleanAndTruncate(incident.description),
        // TODO: Add severity
        priority: this.getPriority(incident.priorityName) ?? null,
        status: this.getStatus(incident.statusName) ?? null,
        createdAt: Utils.toDate(incident.createdTime) ?? null,
        updatedAt: Utils.toDate(incident.updatedTimestamp) ?? null,
        resolvedAt: Utils.toDate(incident.resolutionTimeStamp) ?? null,
      },
    });

    const assigneeUid = incident.assignedUserId;
    if (assigneeUid) {
      res.push({
        model: 'ims_IncidentAssignment',
        record: {
          incident: incidentKey,
          assignee: {
            uid: assigneeUid,
            source,
          },
        },
      });
    }

    for (const ci of incident.ciRequestList ?? []) {
      if (!this.incidentCI.has(incidentKey.uid)) {
        this.incidentCI.set(incidentKey.uid, new Set());
      }
      this.incidentCI.get(incidentKey.uid)!.add(ci.ciId);
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res = [];
    if (this.onlyStoreCurrentIncidentsAssociations(ctx)) {
      res.push(...Array.from(this.incidentCI.keys()).map((incidentKeyStr) => ({
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
        FLUSH,
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

  private getApplicationFromCI(ciId: number, ctx: StreamContext): ComputeApplication | undefined {
    const ci = ctx.get(Incidents.configurationItemsStream.asString, ciId.toString());
    if (!ci) {
      return undefined;
    }
    return this.getApplication(ci.record.data as ConfigurationItem, ctx);
  }

  private getPriority(
    priorityName?: string
  ): {category: IncidentPriorityCategory; detail: string} | undefined {
    if (!isNil(priorityName)) {
      return Utils.toCategoryDetail(IncidentPriorityCategory, priorityName, {
        'Critical - P1': IncidentPriorityCategory.Critical,
        'High - P2': IncidentPriorityCategory.High,
        'Medium - P3': IncidentPriorityCategory.Medium,
        'Low - P4': IncidentPriorityCategory.Low
      });
    }
    return undefined;
  }

  private getStatus(
    statusName?: string
  ): {category: IncidentStatusCategory; detail: string} | undefined {
    if (!isNil(statusName)) {
      return Utils.toCategoryDetail(IncidentStatusCategory, statusName, {
        'Closed': IncidentStatusCategory.Resolved,
        'In Progress': IncidentStatusCategory.Investigating,
        'Open': IncidentStatusCategory.Created,
        'Reopen': IncidentStatusCategory.Identified,
        'Resolved': IncidentStatusCategory.Resolved,
        'Waiting': IncidentStatusCategory.Identified,
      });
    }
    return undefined;
  }
}


