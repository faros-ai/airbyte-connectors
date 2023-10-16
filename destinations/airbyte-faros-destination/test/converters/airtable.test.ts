import {
  AirbyteLog,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteRecord,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {DestinationRecord, StreamContext} from '../../src';
import {
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyResponseCategory,
} from '../../src/converters/airtable/models';
import {Surveys, SurveysConfig} from '../../src/converters/airtable/surveys';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {airtableSurveysAllStreamsLog} from './data';

describe('airtable', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/airtable/surveys/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__airtable__';
  let converter: Surveys;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
    jest.spyOn(Date, 'now').mockImplementation(() => 1697245567000);
    converter = new Surveys();
  });

  afterEach(async () => {
    await mockttp.stop();
    jest.restoreAllMocks();
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(airtableSurveysAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      surveys: 2,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      survey_Question: 1,
      survey_QuestionResponse: 1,
      survey_Survey: 1,
      survey_SurveyQuestionAssociation: 1,
      survey_Survey__Update: 2,
      survey_Team: 1,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  describe('survey responses', () => {
    const DEFAULT_CONFIG: SurveysConfig = {
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
      },
    };
    const RESPONSE = AirbyteRecord.make('surveys', {
      _airtable_id: 'rec1',
      _airtable_created_time: '2023-10-09T14:09:37.000Z',
      _airtable_table_id: 'app0z7JKgJ19t13fw/tbl1',
      _airtable_table_name: 'my_surveys/Survey Responses',
      row: {
        'How much do you like ice cream?': 5,
        'Team Name': 'X',
      },
    });

    test('basic response', async () => {
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );
      const res = await converter.convert(RESPONSE, ctx);
      expect(res).toMatchSnapshot();
    });

    test('survey metadata', async () => {
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec2',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl2',
        _airtable_table_name: 'my_surveys/Survey Metadata',
        row: {
          'Survey Name': 'Survey1',
          'Survey Type': 'ENPS',
          'Survey Started At': '2023-10-09T14:09:37.000Z',
          'Survey Ended At': '2023-10-09T14:09:37.000Z',
          'Survey Status': 'Completed',
          'Survey Description': 'This is a survey',
        },
      });
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );

      expect(await convert(converter, ctx, RESPONSE, record)).toMatchSnapshot();
    });

    test('question metadata', async () => {
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec2',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl2',
        _airtable_table_name: 'my_surveys/Question Metadata',
        row: {
          Question: 'How much do you like ice cream?',
          Category: 'AlignmentAndGoals',
          'Response Type': 'Binary',
        },
      });
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );

      expect(await convert(converter, ctx, RESPONSE, record)).toMatchSnapshot();
    });

    test('response with user and team info', async () => {
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec1',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl1',
        _airtable_table_name: 'my_surveys/Survey Responses',
        row: {
          'How much do you like ice cream?': 5,
          'Team Name': 'X',
          Name: 'John Doe',
          Email: 'john@doe.xyz',
        },
      });
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();
    });

    test('uses team id', async () => {
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec1',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl1',
        _airtable_table_name: 'my_surveys/Survey Responses',
        row: {
          'How much do you like ice cream?': 5,
          'Team Name': 'X',
          'Team ID': 'team1',
          Name: 'John Doe',
          Email: 'john@doe.xyz',
        },
      });
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();
    });

    test('response with survey metadata', async () => {
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            surveys: DEFAULT_CONFIG,
          },
        },
        {}
      );
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec1',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl1',
        _airtable_table_name: 'my_surveys/Survey Responses',
        row: {
          'How much do you like ice cream?': 5,
          'Team Name': 'X',
          Name: 'John Doe',
          Email: 'john@doe.xyz',
          'Survey Name': 'Survey1',
          'Survey Type': 'ENPS',
          'Survey Started At': '2023-10-09T14:09:37.000Z',
          'Survey Ended At': '2023-10-09T14:09:37.000Z',
          'Survey Status': 'Completed',
          'Survey Description': 'This is a survey',
        },
      });
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();
    });

    async function convert(
      converter: Surveys,
      ctx: StreamContext,
      ...recs: AirbyteRecord[]
    ): Promise<DestinationRecord[]> {
      const conversionResults = [];

      for (const record of recs) {
        conversionResults.push(...(await converter.convert(record, ctx)));
      }

      conversionResults.push(...(await converter.onProcessingComplete(ctx)));
      return conversionResults;
    }
  });

  describe('get question category', () => {
    test('category matches enum symbol', () => {
      expect(
        Utils.toCategoryDetail(SurveyQuestionCategory, 'AlignmentAndGoals')
      ).toEqual({
        category: SurveyQuestionCategory.AlignmentAndGoals,
        detail: 'AlignmentAndGoals',
      });
    });

    test('mapped category matches enum symbol', () => {
      const sourceCategory = 'Alignment & Goals';
      const questionCategoryMapping = {
        [sourceCategory]: 'AlignmentAndGoals',
      };

      expect(
        Utils.toCategoryDetail(
          SurveyQuestionCategory,
          sourceCategory,
          questionCategoryMapping
        )
      ).toEqual({
        category: SurveyQuestionCategory.AlignmentAndGoals,
        detail: sourceCategory,
      });
    });

    test('unmatched category', () => {
      const sourceCategory = 'Alignment & Goals';
      const questionCategoryMapping = {
        [sourceCategory]: 'NotARealCategory',
      };

      expect(
        Utils.toCategoryDetail(
          SurveyQuestionCategory,
          sourceCategory,
          questionCategoryMapping
        )
      ).toEqual({
        category: SurveyQuestionCategory.Custom,
        detail: sourceCategory,
      });

      expect(
        Utils.toCategoryDetail(SurveyQuestionCategory, sourceCategory)
      ).toEqual({
        category: SurveyQuestionCategory.Custom,
        detail: sourceCategory,
      });
    });
  });

  describe('get survey category', () => {
    test('type matches enum symbol', () => {
      expect(Utils.toCategoryDetail(SurveyCategory, 'ENPS')).toEqual({
        category: SurveyCategory.ENPS,
        detail: 'ENPS',
      });
    });

    test('unmatched type', () => {
      expect(
        Utils.toCategoryDetail(SurveyCategory, 'NotARealCategory')
      ).toEqual({
        category: SurveyCategory.Custom,
        detail: 'NotARealCategory',
      });
    });
  });

  describe('get survey response category', () => {
    test('category matches enum symbol', () => {
      expect(Utils.toCategoryDetail(SurveyResponseCategory, 'Binary')).toEqual({
        category: SurveyResponseCategory.Binary,
        detail: 'Binary',
      });
    });

    test('unmatched category', () => {
      expect(
        Utils.toCategoryDetail(SurveyResponseCategory, 'NotARealCategory')
      ).toEqual({
        category: SurveyResponseCategory.Custom,
        detail: 'NotARealCategory',
      });
    });
  });

  describe('team uid', () => {
    test('convert team name to team uid', () => {
      expect(Surveys.getTeamUid('My Team Name')).toMatchInlineSnapshot(
        `"a8981623d7d1eb7e7fd16ba387f87e2c857c5d87a18d7da0e9cc246710d13c8a"`
      );
      expect(Surveys.getTeamUid(undefined)).toBeUndefined();
      expect(Surveys.getTeamUid('')).toBeUndefined();
      expect(Surveys.getTeamUid(null)).toBeUndefined();
    });
  });
});
