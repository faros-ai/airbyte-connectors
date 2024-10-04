import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ProjectTasks} from './project_tasks';
import {Projects} from './projects';
import {Tasks} from './tasks';

export class TasksFull extends Tasks {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    ...new Tasks().destinationModels,
    ...new Projects().destinationModels,
    ...new ProjectTasks().destinationModels,
  ];

  override shouldProcessProjectMembership(): boolean {
    return true;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const streams = ['projects', 'project_tasks'];
    streams.forEach((stream) => {
      ctx.markStreamForReset(stream);
    });

    return [];
  }
}
