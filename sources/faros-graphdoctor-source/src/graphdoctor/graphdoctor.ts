import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

import {GraphDoctorTestFunction} from './models';
import {teamOwnershipNulls} from './teamOwnershipNulls';
import {runAllZScoreTests} from './z_scores';

function simpleHash(str): string {
  let hash = 0;
  if (str.length === 0) return '0';

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString();
}

export const orgTeamParentNull: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  const query = 'query MyQuery { org_Team { id name uid parentTeam { uid } } }';
  const response = await fc.gql(cfg.graph, query);
  const results = [];
  const org_Teams = response.org_Team;
  let uid = 0;
  for (const team of org_Teams) {
    if (_.isNull(team.parentTeam) && team.uid !== 'all_teams') {
      const desc_str = `Team other than all_teams has missing parent team, uid=${team.uid}`;
      results.push({
        faros_DataQualityIssue: {
          uid: simpleHash(`${uid.toString}${desc_str}`),
          model: 'org_Team',
          description: desc_str,
          recordIds: [team.id],
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
    const query =
      'query MyQuery { org_TeamMembership { team {id} member {id} id } }';
    const response = await fc.gql(cfg.graph, query);
    const results = [];
    const org_Teams = response.org_TeamMembership;
    let uid = 0;
    for (const rec of org_Teams) {
      if (_.isNull(rec.team) || _.isNull(rec.member)) {
        const desc_str = `Team Membership with ID '${rec.id}' has missing 'team' or 'member'`;
        results.push({
          faros_DataQualityIssue: {
            uid: simpleHash(`${uid.toString}${desc_str}`),
            model: 'org_TeamMembership',
            description: desc_str,
            recordIds: [rec.id],
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
    runAllZScoreTests,
    teamOwnershipNulls,
  ];

  for (const test_func of testFunctions) {
    cfg.logger.info(`Running test function "${test_func.name}".`);
    yield* test_func(cfg, fc);
  }
}
