import {createHash} from 'crypto';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {QueryBuilder} from 'faros-js-client';

import {DestinationModel, DestinationRecord, parseObjectConfig, StreamContext,} from '../converter';
import {AirtableConverter} from './common';
import {
  Survey,
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyResponseCategory,
  SurveyStats,
  SurveyStatusCategory,
  SurveyTeam,
  SurveyUser,
} from './models';

type QuestionCategoryMapping = Record<string, string>;

interface SurveysConfig {
  question_category_mapping?: QuestionCategoryMapping;
  survey_name?: string;
  survey_description?: string;
  survey_type?: SurveyCategory;
  survey_started_at?: string;
  survey_ended_at?: string;
  id_column_name?: string;
  survey_name_column_name?: string;
  survey_type_column_name?: string;
  survey_description_column_name?: string;
  survey_started_at_column_name?: string;
  survey_ended_at_column_name?: string;
  name_column_name?: string;
  email_column_name?: string;
  team_column_name?: string;
  question_category_column_name?: string;
  response_category_column_name?: string;
  question_column_name?: string;
}

export class Surveys extends AirtableConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'survey_Survey',
    'survey_Question',
    'survey_SurveyQuestionAssociation',
    'survey_QuestionResponse',
    'survey_User',
    'survey_Team',
    'survey_TeamMembership',
    'survey_OrgTeam',
  ];

  private surveyQuestionsWithMetadata = [];
  private surveyRecord: Survey;
  private surveysWithStats: Map<string, SurveyStats> = new Map();

  protected config(ctx: StreamContext): SurveysConfig {
    return ctx.config.source_specific_configs?.airtable ?? {};
  }

  protected questionCategoryMapping(
    ctx: StreamContext
  ): QuestionCategoryMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.question_category_mapping,
        'Question Category Mapping'
      ) ?? {}
    );
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const row = record?.record?.data?.row;
    const source = this.streamName.source;

    // Check if row is a question metadata row for pushing it to survey questions metadata records
    if (
      row[config.question_column_name] &&
      row[config.question_category_column_name]
    ) {
      const questionCategoryMapping = this.questionCategoryMapping(ctx);
      const questionWithMetadata = this.getQuestionsWithMetadata(
        row,
        questionCategoryMapping,
        source,
        config
      );
      this.surveyQuestionsWithMetadata.push(questionWithMetadata);
      return [];
    }

    const questions = this.getFilteredQuestions(row, config);
    const tableId = record?.record?.data?._airtable_table_id;

    // check if row contains survey metadata for pushing survey records
    // include questions empty array check to make sure row comes from table with no questions (survey data only)
    if (
      row[config.id_column_name] &&
      row[config.survey_name_column_name] &&
      row[config.survey_type_column_name] &&
      questions.length === 0
    ) {
      this.surveyRecord = this.getSurveyRecord(row, config, tableId, source);
      return [
        {
          model: 'survey_Survey',
          record: this.surveyRecord,
        }
      ];
    }

    const res = [];

    let surveyUser: SurveyUser;
    let surveyTeam: SurveyTeam;

    // Check if row contains user data for pushing user records
    if (
      row[config.name_column_name] &&
      row[config.email_column_name] &&
      row[config.team_column_name]
    ) {
      surveyUser = {
        uid: row[config.email_column_name],
        email: row[config.email_column_name],
        name: row[config.name_column_name],
        source,
      };

      const teamUid = this.getTeamUidFromTeamName(row[config.team_column_name]);
      surveyTeam = {
        uid: teamUid,
        name: row[config.team_column_name],
        description: row[config.team_column_name],
        source,
      };

      res.push(
        ...[
          {
            model: 'survey_User',
            record: surveyUser,
          },
          {
            model: 'survey_Team',
            record: surveyTeam,
          },
          {
            model: 'survey_TeamMembership',
            record: {
              member: surveyUser,
              team: surveyTeam,
            },
          },
          {
            model: 'survey_OrgTeam',
            record: {
              surveyTeam: surveyTeam,
              orgTeam: {
                uid: teamUid,
              },
            },
          },
        ]
      );
    }

    const recordId = this.id(record);
    const submittedAt = record?.record?.data?._airtable_created_time;

    const surveyQuestionRecs = this.getSurveyQuestionRecords(
      questions,
      tableId,
      recordId,
      submittedAt,
      row,
      config,
      source,
      surveyUser,
      surveyTeam
    );
    res.push(...surveyQuestionRecs);

    // Update survey stats for pushing on processing complete
    const surveyId = this.surveyRecord.uid || this.getSurveyId(row, config, tableId);
    this.updateSurveyStats(surveyId, questions);

    return res;
  }

  /** Upsert surveys to add stats and survey questions records to include metadata (question category and response type) **/
  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const qb = new QueryBuilder(ctx.origin);
    const mutations = [];

    // Add survey questions upsert mutations
    this.surveyQuestionsWithMetadata.forEach((survey_Question) => {
      mutations.push(qb.upsert({survey_Question}));
    });

    this.surveysWithStats.forEach((surveyStats, surveyId) => {
      const survey_Survey = {
        uid: surveyId,
        source: this.streamName.source,
        stats: surveyStats,
      };
      mutations.push(qb.upsert({survey_Survey}));
    });

    await ctx.farosClient?.sendMutations(ctx.graph, mutations);
    return [];
  }

  private getQuestionsWithMetadata(
    row: any,
    questionCategoryMapping: QuestionCategoryMapping,
    source: string,
    config: SurveysConfig
  ) {
    const questionCategory = this.getQuestionCategory(
      row[config.question_category_column_name],
      questionCategoryMapping
    );
    // TODO: calculate response type from response received for the question if possible
    const responseType = this.getResponseType(
      row[config.response_category_column_name]
    );
    const question = row[config.question_column_name];
    const questionId = this.createQuestionUid(question);
    return {
      uid: questionId,
      source: source,
      questionCategory: questionCategory,
      responseType: responseType,
    };
  }

  /** Get team uid from team name assuming team name received is the equivalent of snake case uid */
  private getTeamUidFromTeamName(teamName: string) {
    return teamName.toLowerCase().split(' ').join('_');
  }

  private getSurveyQuestionRecords(
    questions: string[],
    tableId: string,
    recordId: string,
    submittedAt: string,
    row: any,
    config: SurveysConfig,
    source: string,
    surveyUser: SurveyUser,
    surveyTeam: SurveyTeam
  ) {
    return questions.flatMap((question, index) => {
      // If id column is not specified and default column name has no value, default to airtable id
      const surveyRecord = this.surveyRecord || this.getSurveyRecord(row, config, tableId, source)
      // Generate digest from question text to create uid
      const questionId = this.createQuestionUid(question);
      const questionRecord = {
        uid: questionId,
        question: question,
        description: question,
        source,
      };
      const surveyQuestionAssociationRecord = {
        survey: surveyRecord,
        question: questionRecord,
        order: index + 1,
      };
      const questionResponse = {
        model: 'survey_QuestionResponse',
        record: {
          uid: recordId,
          source,
          submittedAt,
          response: row[question].toString(),
          surveyQuestion: surveyQuestionAssociationRecord,
          respondent: surveyUser,
          team: surveyTeam,
        },
      };
      const records = [
        questionResponse,
        {
          model: 'survey_Question',
          record: questionRecord,
        },
        {
          model: 'survey_SurveyQuestionAssociation',
          record: surveyQuestionAssociationRecord,
        },
      ];
      // Only add survey record if it was not saved in memory reading survey metadata row
      if (!this.surveyRecord) {
        return [
          ...records,
          {
            model: 'survey_Survey',
            record: surveyRecord,
          }
        ];
      }
      return records;
    });
  }

  private getSurveyRecord(row: any, config: SurveysConfig, tableId: string, source: string): Survey {
    const surveyId = this.getSurveyId(row, config, tableId);
    const surveyData = this.getSurveyData(config, row);
    const surveyType = this.getSurveyType(surveyData.type.detail);
    const surveyStatus = this.getSurveyStatus(
      surveyData.startedAt,
      surveyData.endedAt
    );
    return {
      uid: surveyId,
      source: source,
      status: surveyStatus,
      type: surveyType,
      ...surveyData
    };
  }

  private getSurveyId(row: any, config: SurveysConfig, tableId: string) {
    return row[config.id_column_name] ? row[config.id_column_name] : tableId;
  }

  getSurveyType(type: string) {
    const farosType = SurveyCategory[type];
    if (farosType) {
      return {
        category: farosType,
        detail: type,
      };
    }
    return {
      category: SurveyCategory.Custom,
      detail: type,
    };
  }

  getSurveyStatus(startedAt: string, endedAt: string) {
    if (!startedAt && !endedAt) {
      return {
        category: SurveyStatusCategory.Planned,
        detail: SurveyStatusCategory.Planned,
      };
    }
    if (startedAt && !endedAt) {
      return {
        category: SurveyStatusCategory.InProgress,
        detail: SurveyStatusCategory.InProgress,
      };
    }
    if (startedAt && endedAt) {
      return {
        category: SurveyStatusCategory.Completed,
        detail: SurveyStatusCategory.Completed,
      };
    }
    return {
      category: SurveyStatusCategory.Custom,
      detail: SurveyStatusCategory.Custom,
    };
  }

  getQuestionCategory(
    category: string,
    questionCategoryMapping: QuestionCategoryMapping
  ) {
    const farosCategory = SurveyQuestionCategory[category];
    if (farosCategory) {
      return {
        category: farosCategory,
        detail: category,
      };
    }
    const mappedCategory = questionCategoryMapping[category];
    if (mappedCategory) {
      return {
        category: mappedCategory,
        detail: category,
      };
    }
    return {
      category: SurveyQuestionCategory.Custom,
      detail: category,
    };
  }

  getResponseType(category: string) {
    const farosCategory = SurveyResponseCategory[category];
    if (farosCategory) {
      return {
        category: farosCategory,
        detail: category,
      };
    }
    return {
      category: SurveyResponseCategory.Custom,
      detail: category,
    };
  }

  createQuestionUid(question: string) {
    return createHash('sha256').update(question).digest('hex');
  }

  private updateSurveyStats(surveyId: string, questions: string[]) {
    const stats = this.surveysWithStats.get(surveyId) || {
      questionCount: questions.length,
      invitationCount: 0, // Invitation count is left at 0 as we don't have this data from Airtable
      responseCount: 0,
    };
    stats.responseCount += 1;
    this.surveysWithStats.set(surveyId, stats);
  }

  private getFilteredQuestions(row: any, config: SurveysConfig) {
    return Object.keys(row).filter(
      (question) =>
        ![
          config.id_column_name,
          config.survey_name_column_name,
          config.survey_type_column_name,
          config.survey_description_column_name,
          config.survey_started_at_column_name,
          config.survey_ended_at_column_name,
          config.name_column_name,
          config.email_column_name,
          config.team_column_name,
          'ADSK FY.Q',
          'Date'
        ].includes(question)
    );
  }

  private getSurveyData(config: SurveysConfig, row: any) {
    return {
      name: row[config.survey_name_column_name] ?? config.survey_name,
      type: this.getSurveyType(row[config.survey_type_column_name] ?? config.survey_type),
      description: row[config.survey_description_column_name] ?? config.survey_description,
      startedAt: row[config.survey_started_at_column_name] ?? config.survey_started_at,
      endedAt: row[config.survey_ended_at_column_name] ?? config.survey_ended_at,
    }
  }
}
