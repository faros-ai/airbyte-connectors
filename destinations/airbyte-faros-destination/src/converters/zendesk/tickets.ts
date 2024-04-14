import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {isNil, toLower, toString} from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  TicketFieldsStream,
  TicketMetricsStream,
  ZendeskConfig,
  ZendeskConverter,
} from './common';

export class Tickets extends ZendeskConverter {
  private config: ZendeskConfig = undefined;
  private addedProjectBoard = false;

  private initialize(ctx?: StreamContext): void {
    if (this.config) return;

    this.config = this.config ?? this.zendeskConfig(ctx);

    // Create mapping of field Ids to field names once and store the custom_statuses
    // so we do not keep querying for them from StreamContext
    this.config.fieldIdsByName = new Map<string, Set<number>>();
    const ticketFields = ctx.getAll(TicketFieldsStream.asString);
    for (const field of Object.values(ticketFields)) {
      const fieldName = field.record?.data?.title;
      if (!fieldName) continue;

      if (!this.config.fieldIdsByName.has(fieldName)) {
        this.config.fieldIdsByName.set(fieldName, new Set());
      }
      this.config.fieldIdsByName.get(fieldName)?.add(field.record.data.id);

      if (field.record.data?.type === 'custom_status') {
        this.config.customStatuses = field.record.data.custom_statuses;
      }
    }
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_TmsTaskBoardOptions',
    'tms_Project',
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskProjectRelationship',
    'tms_TaskTag',
  ];

  override get dependencies(): ReadonlyArray<StreamName> {
    return [TicketMetricsStream, TicketFieldsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);

    const ticket = record.record.data;
    const ticketId = ticket.id;
    const taskKey = {uid: toString(ticketId), source: this.streamName.source};
    const recs = [];

    const additionalFields = this.getAdditionalFields(ticket.custom_fields);
    const allMetrics = ctx.getAll(TicketMetricsStream.asString);
    const metricsRecord = Object.values(allMetrics).find(
      (v) => v.record.data.ticket_id === ticketId
    );
    const metrics = metricsRecord?.record?.data;

    const customStatus = this.config.customStatuses?.find(
      (v: any) => v.id === ticket.custom_status_id
    );
    const statusLabel = customStatus?.agent_label;

    const resolution = metrics?.solved_at
      ? {
          resolvedAt: Utils.toDate(metrics?.solved_at),
          resolutionStatus: ticket.status,
        }
      : {};

    const task = {
      ...taskKey,
      ...resolution,
      name: ticket.subject,
      description: Utils.cleanAndTruncate(ticket.description),
      url: ticket.url,
      type: {
        category: 'SupportCase',
        detail: ticket.type,
      },
      status: this.toStatusCategory(ticket.status, statusLabel),
      priority: ticket.priority,
      createdAt: Utils.toDate(ticket.created_at),
      updatedAt: Utils.toDate(ticket.updated_at),
      dueAt: Utils.toDate(ticket.due_at),
      statusChangedAt: Utils.toDate(metrics?.status_updated_at),
      creator: ticket.submitter_id
        ? {uid: toString(ticket.submitter_id), source: this.source}
        : null,
      additionalFields,
    };
    recs.push({model: 'tms_Task', record: task});

    if (ticket.assignee_id) {
      recs.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {
            uid: toString(ticket.assignee_id),
            source: this.source,
          },
          assignedAt: Utils.toDate(metrics?.assigned_at),
        },
      });
    }

    for (const tag of ticket.tags ?? []) {
      const label = {name: tag};
      recs.push({
        model: 'tms_TaskTag',
        record: {label, task: taskKey},
      });
    }

    // Tickets created as a followup to this ticket
    for (const id of ticket.followup_ids ?? []) {
      recs.push({
        model: 'tms_TaskDependency',
        record: {
          dependentTask: {uid: toString(id), source: this.source},
          fulfillingTask: taskKey,
          dependencyType: {category: 'CreatedBy'},
          fulfillingType: {category: 'Created'},
        },
      });
    }

    recs.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        board: {uid: this.projectUid, source: this.streamName.source},
        task: taskKey,
      },
    });
    recs.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        project: {uid: this.projectUid, source: this.streamName.source},
        task: taskKey,
      },
    });

    if (!this.addedProjectBoard) {
      recs.push(...this.getProjectBoardModels());
      this.addedProjectBoard = true;
    }

    return recs;
  }

  private toStatusCategory(
    status: string,
    label?: string
  ): {category: string; detail: string} {
    const detail = label ?? status;
    switch (toLower(status)) {
      case 'new':
        return {category: 'Todo', detail};
      case 'open':
      case 'pending':
      case 'hold':
        return {category: 'InProgress', detail};
      case 'solved':
      case 'closed':
        return {category: 'Done', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  /** Create default project and board for the tickets with same key */
  private getProjectBoardModels(): ReadonlyArray<DestinationRecord> {
    const key = {uid: this.projectUid, source: this.streamName.source};
    return [
      {
        model: 'tms_Project',
        record: {
          ...key,
          name: this.projectName,
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...key,
          name: this.projectName,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {board: key, project: key},
      },
      {
        model: 'faros_TmsTaskBoardOptions',
        record: {board: key, inclusion: {category: 'Included'}},
      },
    ];
  }

  private getAdditionalFields(
    customFields: ReadonlyArray<{id: number; value: any}>
  ): {name: string; value: string}[] {
    const additionalFields = [];
    for (const field of this.config?.ticket_additional_fields ?? []) {
      const fieldIds = this.config.fieldIdsByName.get(field);
      for (const fieldId of fieldIds ?? []) {
        const customFieldValues = (customFields ?? [])
          .filter((f) => f.id === fieldId)
          .map((f) => {
            const value = Array.isArray(f.value)
              ? f.value?.slice(0, this.config?.additional_fields_array_limit)
              : f.value;
            return {
              name: field,
              value: isNil(value)
                ? value
                : Utils.cleanAndTruncate(toString(value)),
            };
          });

        additionalFields.push(...customFieldValues);
      }
    }
    return additionalFields;
  }
}
