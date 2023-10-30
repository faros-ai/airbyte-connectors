import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

import {identityNulls} from './IdentityNulls';
import {GraphDoctorTestFunction} from './models';
import {teamOwnershipNulls} from './teamOwnershipNulls';
import {simpleHash} from './utils';
import {runAllZScoreTests} from './z_scores';

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
      const desc_str = `Missing parent team issue: team with uid "${team.uid}".`;
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

export async function* runGraphDoctorTests(cfg: any, fc: FarosClient): any {
  cfg.logger.info('Running Graph Doctor Tests');
  const testFunctions: GraphDoctorTestFunction[] = [
    orgTeamParentNull,
    runAllZScoreTests,
    teamOwnershipNulls,
    identityNulls,
  ];

  for (const test_func of testFunctions) {
    cfg.logger.info(`Running test function "${test_func.name}".`);
    yield* test_func(cfg, fc);
  }
}
