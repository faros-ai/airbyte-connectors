import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {WorkItem} from './models';

export class Workitems extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskAssignment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const WorkItem = record.record.data as WorkItem;
    return [
      {
        model: 'tms_Task',
        record: {
          uid: String(WorkItem.id),
          id: String(WorkItem.id),
          url: WorkItem.url,
          type: {category: String(WorkItem.fields['System.WorkItemType'])},
          name: WorkItem.fields['System.Title'],
          createdAt: new Date(WorkItem.fields['System.CreatedDate']),
          parent: {uid: String(WorkItem.fields['System.Parent']), source},
          description: WorkItem.fields['System.Description'],
          status: {category: WorkItem.fields['System.State']},
          statusChangedAt: new Date(
            WorkItem.fields['Microsoft.VSTS.Common.StateChangeDate']
          ),
          updatedAt: new Date(
            WorkItem.fields['Microsoft.VSTS.Common.StateChangeDate']
          ),
          creator: {
            uid: WorkItem.fields['System.CreatedBy']['uniqueName'],
            source,
          },
          sprint: {uid: String(WorkItem.fields['System.IterationId']), source},
          source,
        },
      },
      {
        model: 'tms_TaskAssignment',
        record: {
          task: {uid: String(WorkItem.id), source},
          assignee: {
            uid:
              WorkItem.fields['System.AssignedTo']?.uniqueName || 'Unassigned',
            source,
          },
          source,
        },
      },
    ];
  }
}
