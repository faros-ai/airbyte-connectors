import {getLocal} from 'mockttp';
import {destinationWriteTest, initMockttp, tempConfig} from 'faros-airbyte-testing-tools';

describe('wolken', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  describe('users', () => {
    test('users', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/users.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });

  describe('incidents', () => {
    test('incidents', async () => {
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/incidents.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });

    test('incident application impact', async () => {
      configPath = await tempConfig({
        api_url: mockttp.url,
        log_records: true,
        source_specific_configs: {
          wolken: {
            service_id_flex_field_name: 'Service ID',
            application_mapping: {
              A3F91B6D: {name: 'Test App'},
            },
            store_current_incidents_associations: true,
          },
        },
      });
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/incidents_configuration_items.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });

  describe('configuration_items', () => {
    test('configuration_items', async () => {
      configPath = await tempConfig({
        api_url: mockttp.url,
        log_records: true,
        source_specific_configs: {
          wolken: {
            service_id_flex_field_name: 'Service ID',
            jira_project_key_flex_field_name: 'JIRA Key',
            application_tag_flex_field_names: ['Environment'],
            application_tag_flex_field_user_lookup_names: ['Engineering Owner'],
            project_tag_flex_field_names: ['Engineering Owner'],
            path_hierarchy_flex_field_names: ['Service ID'],
            application_mapping: {
              A3F91B6D: {name: 'Test App'},
            },
            user_lookup_extra_fields_mapping: {
              Department: 'userAddress.departmentName',
              Division: 'userFlex[flexName = "Division"].flexValue',
            },
          },
        },
      });
      await destinationWriteTest({
        configPath,
        catalogPath: 'test/resources/wolken/catalog.json',
        inputRecordsPath: 'wolken/configuration_items.log',
        checkRecordsData: (records) => expect(records).toMatchSnapshot(),
      });
    });
  });
});
