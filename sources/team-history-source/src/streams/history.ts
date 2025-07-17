import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import fs from 'fs';
import path from 'path';
import {Dictionary} from 'ts-essentials';

function loadQueryFile(query: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'resources', 'queries', query),
    'utf8'
  );
}

const CURRENT_TEAM_MEMBERSHIPS_QUERY = loadQueryFile(
  'current-team-memberships.gql'
);
const PREVIOUS_TEAM_MEMBERSHIPS_QUERY = loadQueryFile(
  'previous-team-memberships.gql'
);

interface TeamMembership {
  readonly teamUid: string;
  readonly memberUid: string;
  readonly startedAt?: Date;
}

export class TeamMembershipHistory extends AirbyteStreamBase {
  constructor(
    private readonly faros: FarosClient,
    private readonly graph: string,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/team-membership-history.json');
  }

  get primaryKey(): StreamKey {
    return ['teamUid', 'memberUid', 'startedAt'];
  }

  private async *readCurrentTeamMemberships(): AsyncGenerator<TeamMembership> {
    const records = this.faros.nodeIterable(
      this.graph,
      CURRENT_TEAM_MEMBERSHIPS_QUERY
    );

    for await (const {team, member} of records) {
      if (team?.uid && member?.uid) {
        yield {teamUid: team.uid, memberUid: member.uid};
      }
    }
  }

  private async *readPreviousTeamMemberships(): AsyncGenerator<TeamMembership> {
    const records = this.faros.nodeIterable(
      this.graph,
      PREVIOUS_TEAM_MEMBERSHIPS_QUERY
    );

    for await (const {team, member, startedAt} of records) {
      if (team?.uid && member?.uid && startedAt) {
        yield {
          teamUid: team.uid,
          memberUid: member.uid,
          startedAt: new Date(startedAt),
        };
      }
    }
  }

  async *readRecords(): AsyncGenerator<Dictionary<any, string>> {
    const prevTeamsByEmployee = new Map<string, Map<string, Date>>();
    const prevTeamMemberships = this.readPreviousTeamMemberships();
    for await (const {teamUid, memberUid, startedAt} of prevTeamMemberships) {
      if (!prevTeamsByEmployee.has(memberUid)) {
        prevTeamsByEmployee.set(memberUid, new Map<string, Date>());
      }
      prevTeamsByEmployee.get(memberUid)?.set(teamUid, startedAt);
    }

    const teamsByEmployee = new Map<string, Set<string>>();
    const currentTeamMemberships = this.readCurrentTeamMemberships();
    for await (const {teamUid, memberUid} of currentTeamMemberships) {
      if (!teamsByEmployee.has(memberUid)) {
        teamsByEmployee.set(memberUid, new Set());
      }
      teamsByEmployee.get(memberUid)?.add(teamUid);
    }

    // Use a fixed timestamp so that employees who switched teams have a
    // contiguous transition from the old team to the new team
    const now = new Date();

    // This loop checks for team memberships that have ended since last time
    for (const [memberUid, prevTeams] of prevTeamsByEmployee) {
      for (const [teamUid, startedAt] of prevTeams) {
        if (!teamsByEmployee.get(memberUid)?.has(teamUid)) {
          yield {
            teamUid,
            memberUid,
            startedAt,
            endedAt: now,
          };
        }
      }
    }

    // This loop checks for team memberships that have started since last time
    for (const [memberUid, teamUids] of teamsByEmployee) {
      for (const teamUid of teamUids) {
        if (!prevTeamsByEmployee.get(memberUid)?.has(teamUid)) {
          yield {teamUid, memberUid, startedAt: now};
        }
      }
    }
  }
}
