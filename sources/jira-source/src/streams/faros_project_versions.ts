import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {ProjectVersion} from 'faros-airbyte-common/jira';
import {pick} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class FarosProjectVersions extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjectVersions.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<ProjectVersion> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;

    for (const version of await jira.getProjectVersions(projectKey)) {
      yield {
        ...pick(version, [
          'id',
          'description',
          'name',
          'startDate',
          'releaseDate',
          'projectId',
        ]),
        projectKey,
      };
    }
  }
}
