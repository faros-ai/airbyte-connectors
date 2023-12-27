import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

import {getDataQualitySummary} from './dataSummary';
import {duplicateNames} from './duplicateNames';
import {DataSummaryKey, GraphDoctorTestFunction} from './models';
import {checkIfWithinLastXDays, runAllZScoreTests} from './timeTests';
import {getCurrentTimestamp, missingRelationsTest, simpleHash} from './utils';

export const orgTeamParentNull: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  const query =
    'query orgTeamParentNull { org_Team { id name uid parentTeam { uid } } }';
  const response = await fc.gql(cfg.graph, query);
  const results = [];
  const org_Teams = response.org_Team;
  if (!org_Teams) {
    throw new Error(`Failed to get org_Teams from query "${query}".`);
  }
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
          summary: summaryKey,
        },
      });
      uid += 1;
    }
  }
  for (const result of results) {
    yield result;
  }
};

const identityNulls: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  // team Ownership models:
  const identityModels = {
    vcs_UserIdentity: {
      modelName: 'vcsUser',
    },
    ims_UserIdentity: {
      modelName: 'imsUser',
    },
    tms_UserIdentity: {
      modelName: 'tmsUser',
    },
  };
  const query =
    'query identityNulls__%main_object% { %main_object%(where: { _or: [ {_not: {%where_test%: {}}}, {_not: {identity: {}} }] }) { identity {id} %modelName% {id} id } }';

  yield* missingRelationsTest(
    cfg,
    fc,
    identityModels,
    query,
    'identity',
    summaryKey
  );
};

export const teamOwnershipNulls: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  // team Ownership objects:
  const ownershipModels = {
    org_ApplicationOwnership: {
      modelName: 'application',
    },
    org_BoardOwnership: {
      modelName: 'board',
    },
    org_PipelineOwnership: {
      modelName: 'pipeline',
    },
    org_RepositoryOwnership: {
      modelName: 'repository',
    },
    org_TeamMembership: {
      modelName: 'member',
    },
  };
  const query =
    'query teamOwnershipNulls__%main_object% { %main_object%(where: { _or: [ {_not: {%where_test%: {}}}, {_not: {team: {}} }] }) { team {id} %modelName% {id} id } }';

  yield* missingRelationsTest(
    cfg,
    fc,
    ownershipModels,
    query,
    'team',
    summaryKey
  );
};

export async function* runGraphDoctorTests(cfg: any, fc: FarosClient): any {
  const start_timestamp = getCurrentTimestamp();
  const summaryKey: DataSummaryKey = {
    uid: start_timestamp,
    source: 'faros-graphdoctor',
  };
  cfg.logger.info('Running Graph Doctor Tests');

  const testFunctions: GraphDoctorTestFunction[] = [
    orgTeamParentNull,
    teamOwnershipNulls,
    identityNulls,
    duplicateNames,
    runAllZScoreTests,
    checkIfWithinLastXDays,
  ];

  for (const test_func of testFunctions) {
    cfg.logger.info(`Running test function "${test_func.name}".`);
    yield* test_func(cfg, fc, summaryKey);
  }

  cfg.logger.info('Running Graph Doctor Diagnostic Summary');
  const dataQualitySummary = await getDataQualitySummary(
    fc,
    cfg,
    summaryKey,
    start_timestamp
  );
  yield dataQualitySummary;
}
