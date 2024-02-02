import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {StatusValue, WorkItem} from './models';

interface StatusChange {
  readonly status: StatusValue;
  readonly changedAt: Date;
}

export class Workitems extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
  ];

  private statusChangelog(workItem: WorkItem): ReadonlyArray<StatusChange> {
    const statusChangelog: Array<StatusChange> = [];

    if (workItem && workItem?.item2) {
      for (const item of workItem.item2) {
        if (
          item &&
          item.fields &&
          item.fields['System.State'] &&
          item.fields['System.State'].oldValue &&
          item.fields['System.ChangedDate'] &&
          this.isValidDate(item.fields['System.ChangedDate'].newValue)
        ) {
          statusChangelog.push({
            status: {
              newValue: item.fields['System.State'].newValue,
              oldValue: item.fields['System.State'].oldValue,
            },
            changedAt: item.fields['System.ChangedDate'].newValue,
          });
        }
      }
    }

    return statusChangelog;
  }
  private isValidDate(dateString: string): boolean {
    const timestamp = Date.parse(dateString);
    return !isNaN(timestamp);
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const WorkItem = record.record.data as WorkItem;
    const organizationName = this.getOrganizationFromUrl(WorkItem?.item?.url);
    const organization = {uid: organizationName, source};
    const statusChangelog = this.statusChangelog(WorkItem);

    return [
      {
        model: 'tms_Task',
        record: {
          uid: String(WorkItem?.item?.id),
          id: String(WorkItem?.item?.id),
          url: WorkItem?.item?.url,
          type: {
            category: String(WorkItem?.item?.fields['System.WorkItemType']),
          },
          name: WorkItem?.item?.fields['System.Title'],
          createdAt: new Date(WorkItem?.item?.fields['System.CreatedDate']),
          parent: {
            uid: String(WorkItem?.item?.fields['System.Parent']),
            source,
          },
          description: WorkItem?.item?.fields['System.Description'],
          status: {category: WorkItem?.item?.fields['System.State']},
          statusChangedAt: WorkItem?.item?.fields[
            'Microsoft.VSTS.Common.StateChangeDate'
          ]
            ? new Date(
                WorkItem?.item?.fields['Microsoft.VSTS.Common.StateChangeDate']
              )
            : null,
          statusChangelog: statusChangelog,
          updatedAt: WorkItem?.item?.fields[
            'Microsoft.VSTS.Common.StateChangeDate'
          ]
            ? new Date(
                WorkItem?.item?.fields['Microsoft.VSTS.Common.StateChangeDate']
              )
            : null,
          creator: {
            uid: WorkItem?.item?.fields['System.CreatedBy']['uniqueName'],
            source,
          },
          sprint: {
            uid: String(WorkItem?.item?.fields['System.IterationId']),
            source,
          },
          source,
          organization,
        },
      },
      {
        model: 'tms_TaskAssignment',
        record: {
          task: {uid: String(WorkItem?.item?.id), source},
          assignee: {
            uid:
              WorkItem?.item?.fields['System.AssignedTo']?.uniqueName ||
              'Unassigned',
            source,
          },
          source,
        },
      },
    ];
  }
}
