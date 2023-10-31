// import {FarosClient} from 'faros-js-client';

// import { GraphDoctorTestFunction} from './models';
// import { missingRelationsTest} from './utils';

// export const teamOwnershipNulls: GraphDoctorTestFunction = async function* (
//   cfg: any,
//   fc: FarosClient
// ) {
//   // team Ownership objects:
//   const ownershipObjects = {
//     org_ApplicationOwnership: {
//       obj_nm: 'application',
//     },
//     org_BoardOwnership: {
//       obj_nm: 'board',
//     },
//     org_PipelineOwnership: {
//       obj_nm: 'pipeline',
//     },
//     org_RepositoryOwnership: {
//       obj_nm: 'repository',
//     },
//     org_TeamMembership: {
//       obj_nm: 'member',
//     },
//   };
//   const query =
//     'query MyQuery { %main_object%(where: { _or: [ {_not: {%where_test%: {}}}, {_not: {team: {}} }] }) { team {id} %obj_nm% {id} id } }';

//   yield* missingRelationsTest(cfg, fc, ownershipObjects, query, 'team')
// };
