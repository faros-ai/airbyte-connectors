import {StreamKey} from 'faros-airbyte-cdk';
import {TeamMembership} from 'faros-airbyte-common/lib/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosTeamMemberships extends StreamBase {
  get dependencies(): ReadonlyArray<string> {
    return ['faros_teams'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTeamMemberships.json');
  }

  get primaryKey(): StreamKey {
    return ['teamId', 'memberId'];
  }

  async *readRecords(): AsyncGenerator<TeamMembership> {
    const jira = await Jira.instance(this.config, this.logger);
    for (const team of await jira.getTeams(this.config.organization_id)) {
      for await (const member of jira.getTeamMemberships(
        this.config.organization_id,
        team.id
      )) {
        yield {teamId: team.id, memberId: member.id};
      }
    }
  }
}
