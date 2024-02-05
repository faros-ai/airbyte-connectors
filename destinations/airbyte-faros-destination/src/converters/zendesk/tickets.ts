import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower, toString} from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {
  TicketFieldsStream,
  TicketMetricsStream,
  ZendeskConverter,
} from './common';

export class Tickets extends ZendeskConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
    'tms_TaskDependency',
    'tms_TaskTag',
  ];

  override get dependencies(): ReadonlyArray<StreamName> {
    return [TicketMetricsStream, TicketFieldsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const ticket = record.record.data;
    const ticketId = ticket.id;
    const taskKey = {uid: toString(ticketId), source: this.streamName.source};
    const recs = [];

    const allMetrics = ctx.getAll(TicketMetricsStream.asString);
    const metricsRecord = Object.values(allMetrics).find(
      (v) => v.record.data.ticket_id === ticketId
    );
    const metrics = metricsRecord?.record?.data;

    const ticketFields = ctx.getAll(TicketFieldsStream.asString);
    const customStatusRecord = Object.values(ticketFields).find(
      (v) => v.record.data.type === 'custom_status'
    );
    const customStatuses = customStatusRecord?.record?.data?.custom_statuses;
    const customStatus = customStatuses?.find(
      (v: any) => v.id === ticket.custom_status_id
    );
    const statusLabel = customStatus?.agent_label;

    const additionalFields = [];
    for (const field of ticket.fields ?? []) {
      const fieldsRecord = ctx.get(TicketFieldsStream.asString, field.id);
      const fieldName = fieldsRecord?.record?.data?.title;
      if (!fieldName) continue;

      additionalFields.push({name: fieldName, value: field.value});
    }

    const resolution = metrics?.solved_at
      ? {
          resolvedAt: Utils.toDate(metrics?.solved_at),
          resolutionStatus: ticket.status,
        }
      : {};

    // TODO - Add handle for additional fields
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
      // TODO - Enable when due_at is released
      //   dueAt: Utils.toDate(ticket.due_at),
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
}
