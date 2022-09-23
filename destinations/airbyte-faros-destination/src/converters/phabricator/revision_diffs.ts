import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {FileDiff} from 'faros-airbyte-common/common';
import {Dictionary} from 'ts-essentials';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

interface RevisionDiff {
  id: number;
  phid: string;
  revision: {
    id: number;
    phid: string;
    dateModified: number;
  };
  repository: Dictionary<any>;
  files: ReadonlyArray<FileDiff>;
}

export class RevisionDiffs extends PhabricatorConverter {
  private readonly logger: AirbyteLogger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_File',
    'vcs_PullRequestFile',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const diff = record.record.data as RevisionDiff;
    const res: DestinationRecord[] = [];
    const repository = PhabricatorCommon.repositoryKey(diff.repository, source);
    const diffShort = {
      id: diff.id,
      phid: diff.phid,
      revision: diff.revision,
      repository: diff.repository,
    };
    if (!repository) {
      this.logger.warn(
        `Could not determine repository from revision diff ${JSON.stringify(
          diffShort
        )}`
      );
      return res;
    } else if (!diff.revision?.id) {
      this.logger.warn(
        `Could not determine revision from revision diff ${JSON.stringify(
          diffShort
        )}`
      );
      return res;
    }

    const pullRequest = {
      number: diff.revision.id,
      uid: diff.revision.id.toString(),
      repository,
    };

    res.push(...Common.processVcsPullRequestFileDiffs(diff.files, pullRequest));
    return res;
  }
}
