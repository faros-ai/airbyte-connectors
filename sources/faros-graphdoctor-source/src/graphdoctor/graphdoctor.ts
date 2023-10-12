import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

interface GraphDoctorTestFunction {
  (cfg: any, fc: FarosClient): AsyncGenerator<any>;
}

export const orgTeamParentNull: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  // We should add queries which return pages and yield results per page
  // For now yielding all at once
  cfg.logger.info('running orgTeamParentNull');
  const query = 'query MyQuery { org_Team { id name uid parentTeam { uid } } }';
  const response = await fc.gql(cfg.graph, query);
  const results = [];
  const org_Teams = response.org_Team;
  let uid = 0;
  for (const team of org_Teams) {
    if (_.isNull(team.parentTeam) && team.uid !== 'all_teams') {
      results.push({
        faros_DataQualityIssue: {
          uid: uid.toString(),
          model: 'org_Team',
          description: `Team other than all_teams has missing parent team, uid=${team.uid}`,
        },
      });
      uid += 1;
    }
  }
  for (const result of results) {
    yield result;
  }
};

export const orgTeamAssignmentNullTeam: GraphDoctorTestFunction =
  async function* (cfg: any, fc: FarosClient) {
    // We should add queries which return pages and yield results per page
    // For now yielding all at once
    //cfg.logger.info('running orgTeamAssignmentNullTeam');
    const query =
      'query MyQuery { org_TeamMembership { team {id} member {id} id } }';
    const response = await fc.gql(cfg.graph, query);
    const results = [];
    const org_Teams = response.org_TeamMembership;
    let uid = 0;
    for (const rec of org_Teams) {
      if (_.isNull(rec.team) || _.isNull(rec.member)) {
        results.push({
          faros_DataQualityIssue: {
            uid: uid.toString(),
            model: 'org_TeamMembership',
            description: `Team Membership with ID '${rec.id}' has missing 'team' or 'member'`,
          },
        });
        uid += 1;
      }
    }
    for (const result of results) {
      yield result;
    }
  };

export async function* runGraphDoctorTests(cfg: any, fc: FarosClient): any {
  cfg.logger.info('Running Graph Doctor Tests');
  const testFunctions: GraphDoctorTestFunction[] = [
    orgTeamParentNull,
    orgTeamAssignmentNullTeam,
  ];

  for (const test_func of testFunctions) {
    yield* test_func(cfg, fc);
  }
}
