import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

export async function* orgTeamParentNull(
  cfg: any,
  fc: FarosClient
): AsyncGenerator<any[]> {
  // We should add queries which return pages and yield results per page
  // For now yielding all at once
  const query = 'query MyQuery { org_Team { id name uid parentTeam { uid } } }';
  const response = await fc.gql(cfg.graph, query);
  const results = [];
  const org_Teams = response.org_Team;
  let uid = 0;
  for (const team of org_Teams) {
    if (_.isNull(team.parentTeam) && !(team.uid === 'all_teams')) {
      results.push({
        faros_DataQualityIssue: {
          uid: uid.toString(),
          model: 'org_Team',
          description: `Team other than all_teams has missing parent team, uid=${team.uid}`,
        },
      });
      cfg.logger.info('found missing');
      uid += 1;
    } else {
      cfg.logger.info(JSON.stringify(team));
    }
  }

  for (let i = 0; i < results.length; i++) {
    yield results[i];
  }
}

//export const graphTestFuncs = {
//  sampleTestFunc,
//};
