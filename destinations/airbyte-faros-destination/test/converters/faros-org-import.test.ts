import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../../src/testing-tools/testing-tools';
import {destinationWriteTest} from '../../src/testing-tools/utils';

describe('faros-org-import', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        faros_org_import: {
          source: {
            ams: 'test-ams',
            vcs: 'test-vcs',
            ims: 'test-ims',
            survey: 'test-survey',
            tms: 'test-tms',
            cal: 'test-cal',
          },
        },
      },
    });

    await mockttp.forPost('/graphs/test-graph/graphql').thenReply(200, '[]');
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros-org-import/catalog.json',
      inputRecordsPath: 'faros-org-import/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('skips teams below min_team_size and reassigns users', async () => {
    const minTeamSizeConfigPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        faros_org_import: {
          source: {
            ams: 'test-ams',
            vcs: 'test-vcs',
            ims: 'test-ims',
            survey: 'test-survey',
            tms: 'test-tms',
            cal: 'test-cal',
          },
          min_team_size: 3, // Set min_team_size to 3 for testing
        },
      },
    });

    await mockttp.forPost('/graphs/test-graph/graphql').thenReply(200, '[]');

    await destinationWriteTest({
      configPath: minTeamSizeConfigPath,
      catalogPath: 'test/resources/faros-org-import/catalog.json',
      inputRecordsPath: 'test/resources/faros-org-import/small-teams.log',
      checkRecordsData: (records) => {
        const teamRecords = records.filter(r => r.model === 'org_Team');
        const smallTeamExists = teamRecords.some(r => r.record.uid === 'small_team');
        expect(smallTeamExists).toBeFalsy();
        
        const mediumTeamExists = teamRecords.some(r => r.record.uid === 'medium_team');
        const largeTeamExists = teamRecords.some(r => r.record.uid === 'large_team');
        expect(mediumTeamExists).toBeTruthy();
        expect(largeTeamExists).toBeTruthy();
        
        const teamMemberships = records.filter(r => r.model === 'org_TeamMembership');
        const emp1MembershipToMediumTeam = teamMemberships.some(
          r => r.record.member.uid === 'emp1' && r.record.team.uid === 'medium_team'
        );
        const emp2MembershipToMediumTeam = teamMemberships.some(
          r => r.record.member.uid === 'emp2' && r.record.team.uid === 'medium_team'
        );
        expect(emp1MembershipToMediumTeam).toBeTruthy();
        expect(emp2MembershipToMediumTeam).toBeTruthy();
        
        expect(records).toMatchSnapshot();
      },
    });
  });
});
