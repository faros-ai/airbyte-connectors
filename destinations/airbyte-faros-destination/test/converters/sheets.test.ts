import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {initMockttp} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

import {StreamContext} from '../../src';
import {SurveysConfig} from '../../src/converters/abstract-surveys/surveys';
import {Surveys} from '../../src/converters/sheets/surveys';

describe('sheets', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let converter: Surveys;

  beforeEach(async () => {
    await initMockttp(mockttp);
    jest.spyOn(Date, 'now').mockImplementation(() => 1697245567000);
    converter = new Surveys();
  });

  afterEach(async () => {
    await mockttp.stop();
    jest.restoreAllMocks();
  });

  describe('survey responses', () => {
    const surveysConfig: SurveysConfig = {
      survey_responses_table_name: 'Survey Responses',
      survey_metadata_table_name: 'Survey Metadata',
      question_metadata_table_name: 'Question Metadata',
      question_category_mapping: {},
      column_names_mapping: {
        survey_name_column_name: 'Survey Name',
        survey_type_column_name: 'Survey Type',
        survey_started_at_column_name: 'Survey Started At',
        survey_ended_at_column_name: 'Survey Ended At',
        survey_status_column_name: 'Survey Status',
        survey_description_column_name: 'Survey Description',
        respondent_name_column_name: 'Name',
        respondent_email_column_name: 'Email',
        respondent_team_name_column_name: 'Team Name',
        respondent_team_id_column_name: 'Team ID',
        question_category_column_name: 'Category',
        response_type_column_name: 'Response Type',
        question_column_name: 'Question',
        response_submitted_at_column_name: 'Timestamp',
      },
    };

    test('basic response convert and getters', async () => {
      const record = AirbyteRecord.make('surveys', {
        id: '10hWFrCr5c0J7wUjoPODgd7jt6pRjPBGJTtD6y_z2He4_survey_responses_1',
        sheetId: '10hWFrCr5c0J7wUjoPODgd7jt6pRjPBGJTtD6y_z2He4',
        sheetName: 'Survey Responses',
        row: {
          'How much do you like ice cream?': 5,
          'Team Name': 'X',
          Timestamp: '2023-10-09T14:09:37.000Z',
        },
      });
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: surveysConfig,
          },
        },
        {}
      );
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();

      const id = converter.id(record);
      expect(id).toEqual(
        '10hWFrCr5c0J7wUjoPODgd7jt6pRjPBGJTtD6y_z2He4_survey_responses_1'
      );

      const submittedAt = converter.getSubmittedAt(record);
      expect(submittedAt).toEqual('2023-10-09T14:09:37.000Z');

      const surveyId = converter.getSurveyId(record);
      expect(surveyId).toEqual('10hWFrCr5c0J7wUjoPODgd7jt6pRjPBGJTtD6y_z2He4');

      const tableName = converter.getTableName(record);
      expect(tableName).toEqual('Survey Responses');
    });
  });
});
