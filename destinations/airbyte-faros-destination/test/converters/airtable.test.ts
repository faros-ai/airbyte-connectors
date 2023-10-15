import {
  AirbyteLog,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteRecord,
} from 'faros-airbyte-cdk';
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

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
    jest.spyOn(Date, 'now').mockImplementation(() => 1697245567000);
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
    const converter = new Surveys();
    const DEFAULT_CONFIG: SurveysConfig = {
      question_category_mapping: {},
      column_names_mapping: {
        survey_name_column_name: 'SurveyName',
        survey_type_column_name: 'SurveyType',
        survey_started_at_column_name: 'SurveyStartedAt',
        survey_ended_at_column_name: 'SurveyEndedAt',
        survey_description_column_name: 'SurveyDescription',
        name_column_name: 'Name',
        email_column_name: 'Email',
        team_column_name: 'Team',
        question_category_column_name: 'Category',
        response_type_column_name: 'ResponseType',
        question_column_name: 'Question',
      },
    };
    const RESPONSE = AirbyteRecord.make('surveys', {
      _airtable_id: 'rec1',
      _airtable_created_time: '2023-10-09T14:09:37.000Z',
      _airtable_table_id: 'app0z7JKgJ19t13fw/tbl1',
      _airtable_table_name: 'my_surveys/Table 1',
      row: {
        'How much do you like ice cream?': 5,
        Team: 'X',
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
        _airtable_table_name: 'my_surveys/Survey metadata',
        row: {
          SurveyName: 'Survey1',
          SurveyType: 'ENPS',
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

      expect(
        await convert(new Surveys(), ctx, RESPONSE, record)
      ).toMatchSnapshot();
    });

    test('question metadata', async () => {
      const record = AirbyteRecord.make('surveys', {
        _airtable_id: 'rec2',
        _airtable_created_time: '2023-10-09T14:09:37.000Z',
        _airtable_table_id: 'app0z7JKgJ19t13fw/tbl2',
        _airtable_table_name: 'my_surveys/Question metadata',
        row: {
          Question: 'How much do you like ice cream?',
          Category: 'AlignmentAndGoals',
          ResponseType: 'Binary',
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

      expect(
        await convert(new Surveys(), ctx, RESPONSE, record)
      ).toMatchSnapshot();
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
        _airtable_table_name: 'my_surveys/Table 1',
        row: {
          'How much do you like ice cream?': 5,
          Team: 'X',
          Name: 'John Doe',
          Email: 'john@doe.xyz',
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
        Surveys.toCategoryDetail(SurveyQuestionCategory, 'AlignmentAndGoals')
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
        Surveys.toCategoryDetail(
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
        Surveys.toCategoryDetail(
          SurveyQuestionCategory,
          sourceCategory,
          questionCategoryMapping
        )
      ).toEqual({
        category: SurveyQuestionCategory.Custom,
        detail: sourceCategory,
      });

      expect(
        Surveys.toCategoryDetail(SurveyQuestionCategory, sourceCategory)
      ).toEqual({
        category: SurveyQuestionCategory.Custom,
        detail: sourceCategory,
      });
    });
  });

  describe('get survey category', () => {
    test('type matches enum symbol', () => {
      expect(Surveys.toCategoryDetail(SurveyCategory, 'ENPS')).toEqual({
        category: SurveyCategory.ENPS,
        detail: 'ENPS',
      });
    });

    test('unmatched type', () => {
      expect(
        Surveys.toCategoryDetail(SurveyCategory, 'NotARealCategory')
      ).toEqual({
        category: SurveyCategory.Custom,
        detail: 'NotARealCategory',
      });
    });
  });

  describe('get survey response category', () => {
    test('category matches enum symbol', () => {
      expect(
        Surveys.toCategoryDetail(SurveyResponseCategory, 'Binary')
      ).toEqual({
        category: SurveyResponseCategory.Binary,
        detail: 'Binary',
      });
    });

    test('unmatched category', () => {
      expect(
        Surveys.toCategoryDetail(SurveyResponseCategory, 'NotARealCategory')
      ).toEqual({
        category: SurveyResponseCategory.Custom,
        detail: 'NotARealCategory',
      });
    });
  });
});
