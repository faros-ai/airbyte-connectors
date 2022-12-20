import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Command} from 'commander';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {WorkItem} from './models';
import {FarosDestinationRunner} from '../../destination-runner'

export class Workitems extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const WorkItem = record.record.data as WorkItem;
    return [
      {
        model: 'tms_Task',
        record: {
          id: String(WorkItem.id),
          url: WorkItem.url,
          type: WorkItem.fields.System.WorkItemType,
          createdAt: new Date(WorkItem.fields.System.CreatedDate),
          parent: WorkItem.fields.System.parent,
        },
      },
    ];
  }
}

export function mainCommand(): Command {
  const destinationRunner = new FarosDestinationRunner();

  // Register your custom converter(s)
  destinationRunner.registerConverters(
    new Workitems()
    );

  return destinationRunner.program;
}
