import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Tags extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  private readonly projectsStream = new StreamName('gitlab', 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.projectsStream];
  }

  id(record: AirbyteRecord): any {
    return record?.record?.data?.name;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data;

    const projectsStream = this.projectsStream.asString;
    const project = ctx.get(projectsStream, String(tag.project_id));
    const repository = GitlabCommon.parseRepositoryKey(
      project?.record?.data?.web_url,
      source
    );

    if (!repository) return [];

    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          message: tag.message,
          commit: {sha: tag.commit_id, uid: tag.commit_id, repository},
          repository,
        },
      },
    ];
  }
}
