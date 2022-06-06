import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib/utils';
import {toLower} from 'lodash';
import normalizeUrl from 'normalize-url';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TravisCICommon, TravisCIConverter} from './common';
import {
  Build,
  BuildKey,
  OrganizationKey,
  PipelineKey,
  VCSCommitKey,
  VCSOrganizationKey,
  VCSRepositoryKey,
} from './models';

export class Builds extends TravisCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildStep',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data as Build;
    const res: DestinationRecord[] = [];
    const organizationKey: OrganizationKey = {
      uid: toLower(build.created_by.login),
      source,
    };
    const pipelineKey: PipelineKey = {
      organization: organizationKey,
      uid: toLower(build.repository.slug),
    };
    const status = TravisCICommon.convertBuildState(build.state);
    const buildKey: BuildKey = {uid: String(build.id), pipeline: pipelineKey};

    const vcsOrganizationKey: VCSOrganizationKey = {
      uid: toLower(build.created_by.login),
      source: TravisCICommon.parseVCSType(build.commit.compare_url),
    };

    const vcsRepositoryKey: VCSRepositoryKey = {
      organization: vcsOrganizationKey,
      name: toLower(build.repository.name),
    };

    const vcsCommitKey: VCSCommitKey = {
      repository: vcsRepositoryKey,
      sha: toLower(build.commit.sha),
    };

    res.push({
      model: 'cicd_Build',
      record: {
        ...buildKey,
        number: Utils.parseInteger(build.number),
        status,
        url: normalizeUrl(this.travisciUrl(ctx).concat(build.href)),
        startedAt: Utils.toDate(build.started_at),
        endedAt: Utils.toDate(build.finished_at),
      },
    });

    build.jobs.forEach((job) => {
      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          createdAt: Utils.toDate(job.created_at),
          startedAt: Utils.toDate(job.started_at),
          endedAt: Utils.toDate(job.finished_at),
          status: TravisCICommon.convertBuildState(job.state),
          url: normalizeUrl(this.travisciUrl(ctx).concat(job.href)),
          build: buildKey,
        },
      });
    });

    res.push({
      model: 'cicd_BuildCommitAssociation',
      record: {build: buildKey, commit: vcsCommitKey},
    });

    return res;
  }
}
