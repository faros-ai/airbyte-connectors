import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OpsGenieConverter} from './common';
import {
  Alert,
  AlertIntegrationType,
  AlertPriority,
  AlertPriorityCategory,
  AlertReportAssociation,
  AlertStatus,
  AlertStatusCategory,
  OpsGenieAlertriority,
} from './models';

export class Alerts extends OpsGenieConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Alert',
    'ims_AlertAssignment',
    'ims_AlertTag',
    'ims_Label',
    'ims_AlertIntegrationAssociation',
    'ims_TeamAlertAssociation',
    'ims_AlertSourceAssociation',
    'ims_AlertReportAssociation',
  ];

  private seenTags = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const alert = record.record.data as Alert;
    const res: DestinationRecord[] = [];

    const alertRef = {uid: alert.id, source};
    const createdAt = Utils.toDate(alert.createdAt);
    const updatedAt = Utils.toDate(alert.updatedAt);
    const lastOccurredAt = Utils.toDate(alert.lastOccurredAt);
    const alertsouce = alert.source;
    const alertOwner = alert.owner;

    for (const integration of [alert.integration]) {
      const integrationType: AlertIntegrationType = {
        type: integration.type,
        name: integration.name,
      };

      // Creating association alert and integration
      res.push({
        model: 'ims_AlertIntegrationAssociation',
        record: {
          uid: integration.id,
          type: integrationType,
          alert: alertRef,
          detail: alert.message,
          createdAt: alert.createdAt,
        },
      });
    }

    // pushing the alert data
    res.push({
      model: 'ims_Alert',
      record: {
        ...alertRef,
        title: alert.message,
        createdAt,
        updatedAt,
        lastOccurredAt,
        alertsouce,
        alertOwner,
        priority: this.getPriority(alert.priority),
        status: this.getAlertStatus(alert.status),
      },
    });

    // Creating association between alerts and reports for the alerts
    for (const report of [alert.report]) {
      const reportData: AlertReportAssociation = {
        ackTime: report.ackTime,
        closeTime: report.closeTime,
        acknowledgedBy: report.acknowledgedBy,
        closedBy: report.closedBy,
      };

      res.push({
        model: 'ims_AlertReportAssociation',
        record: {
          report: reportData,
          alert: alertRef,
          detail: alert.message,
          createdAt: alert.createdAt,
        },
      });
    }

    // Creating association between alerts and sources of alerts
    res.push({
      model: 'ims_AlertSourceAssociation',
      record: {
        source: alert.source,
        alert: alertRef,
      },
    });

    for (const responder of alert.responders) {
      const assignee = {uid: responder.id, source};
      if (responder.type === 'user') {
        res.push({
          model: 'ims_AlertAssignment',
          record: {
            assignee,
            alert: alertRef,
          },
        });
      } else {
        res.push({
          model: 'ims_TeamAlertAssociation',
          record: {
            team: assignee,
            alert: alertRef,
          },
        });
      }
    }

    for (const tag of alert.tags) {
      if (!this.seenTags.has(tag)) {
        this.seenTags.add(tag);
        res.push({
          model: 'ims_Label',
          record: {
            name: tag,
          },
        });
      }
      res.push({
        model: 'ims_AlertTag',
        record: {
          label: {name: tag},
          alert: alertRef,
        },
      });
    }
    return res;
  }

  private getPriority(priority: string): AlertPriority {
    const detail: string = priority;
    switch (priority) {
      case OpsGenieAlertriority.P1:
        return {category: AlertPriorityCategory.Critical, detail};
      case OpsGenieAlertriority.P2:
        return {category: AlertPriorityCategory.High, detail};
      case OpsGenieAlertriority.P3:
        return {category: AlertPriorityCategory.Moderate, detail};
      case OpsGenieAlertriority.P4:
        return {category: AlertPriorityCategory.Low, detail};
      default:
        return {category: AlertPriorityCategory.Informational, detail};
    }
  }

  private getAlertStatus(status: string): {
    category: string;
    detail: string;
  } {
    const detail = status;
    switch (status) {
      case AlertStatus.open:
        return {category: AlertStatusCategory.Open, detail};
      case AlertStatus.closed:
        return {category: AlertStatusCategory.Closed, detail};
      default:
        return {category: AlertStatusCategory.Closed, detail};
    }
  }
}
