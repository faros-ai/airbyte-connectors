import {AirbyteRecord} from 'faros-airbyte-cdk';
import parseGitUrl from 'git-url-parse';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Pipeline, Repo, RepoSource} from './common';

export class BuildkitePipelines extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  private extractRepo(
    provider: string | undefined,
    repoUrl: string
  ): RepoSource | undefined {
    const gitUrl = parseGitUrl(repoUrl);

    const lowerSource = provider
      ? provider.toLowerCase()
      : gitUrl.source?.toLowerCase();

    let source: RepoSource;
    if (lowerSource?.includes('bitbucket')) source = RepoSource.BITBUCKET;
    else if (lowerSource?.includes('gitlab')) source = RepoSource.GITLAB;
    else if (lowerSource?.includes('github')) source = RepoSource.GITHUB;
    else source = RepoSource.VCS;

    if (!gitUrl.organization || !gitUrl.name) return undefined;

    return source;
  }
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;

    const repo = this.extractRepo(
      pipeline.repository.provider.name,
      pipeline.repository.url
    );

    return [
      {
        model: 'cicd_Pipeline',
        record: {
          uid: pipeline.uuid,
          name: pipeline.name,
          description: pipeline.description,
          url: pipeline.url,
          repo,
          source,
        },
      },
    ];
  }
}
