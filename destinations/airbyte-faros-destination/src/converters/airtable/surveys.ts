import {AirbyteRecord, toDate} from 'faros-airbyte-cdk';
import _ from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';
import {AirtableConverter} from './common';
import {
  QuestionCategoryMapping,
  Survey,
  SurveyCategory,
  SurveyQuestion,
  SurveyQuestionCategory,
  SurveyResponseCategory,
  SurveyStats,
  SurveyStatusCategory,
  SurveyTeam,
  SurveyUser,
} from './models';

type ColumnNameMapping = {
  survey_name_column_name?: string;
  survey_type_column_name?: string;
  survey_description_column_name?: string;
  survey_started_at_column_name?: string;
  survey_ended_at_column_name?: string;
  survey_status_column_name?: string;
  name_column_name?: string;
  email_column_name?: string;
  team_column_name?: string;
  question_category_column_name?: string;
  response_type_column_name?: string;
  question_column_name?: string;
};

export interface SurveysConfig {
  question_category_mapping?: QuestionCategoryMapping;
  column_names_mapping?: ColumnNameMapping;
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
    'survey_UserIdentity',
  ];

  private questionMetadata: Map<string, SurveyQuestion> = new Map();
  private surveyMetadata: Map<string, Survey> = new Map();
  private surveyStats: Map<string, SurveyStats> = new Map();

  private usersSeen = new Set<string>();
  private teamsSeen = new Set<string>();
  private surveysSeen = new Set<string>();
  private questionsSeen = new Set<string>();

  protected config(ctx: StreamContext): SurveysConfig {
    return ctx.config.source_specific_configs?.surveys ?? {};
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
    const tableId = record?.record?.data?._airtable_table_id;

    // Question metadata
    if (
      row[config.column_names_mapping.question_column_name] &&
      row[config.column_names_mapping.question_category_column_name]
    ) {
      this.processQuestionMetadata(ctx, tableId, row, source, config);
      return [];
    }

    const questions = this.getFilteredQuestions(row, config);

    // Survey metadata
    if (
      row[config.column_names_mapping.survey_name_column_name] &&
      row[config.column_names_mapping.survey_type_column_name] &&
      // Check if there are any questions in the row
      // If there are no questions, then this is a survey metadata row
      questions.length === 0
    ) {
      const surveyRecord = this.getSurveyRecord(row, config, tableId, source);
      this.surveyMetadata.set(surveyRecord.uid, surveyRecord);
      return [];
    }

    // Survey response
    const res = this.processResponse(
      row,
      config,
      source,
      record,
      questions,
      tableId
    );

    // Update survey stats for pushing on processing complete
    const surveyId = Surveys.getSurveyId(tableId);
    this.updateSurveyStats(surveyId, questions);

    return res;
  }

  private processResponse(
    row: any,
    config: SurveysConfig,
    source: string,
    record: AirbyteRecord,
    questions: string[],
    tableId: any
  ) {
    const res = [];

    const surveyUser: SurveyUser | undefined = this.getSurveyUser(
      row,
      config,
      source
    );
    const surveyTeam: SurveyTeam | undefined = this.getSurveyTeam(
      row,
      config,
      source
    );

    if (surveyUser && !this.usersSeen.has(surveyUser.uid)) {
      this.usersSeen.add(surveyUser.uid);
      res.push({
        model: 'survey_User',
        record: surveyUser,
      });
    }

    if (surveyTeam && !this.teamsSeen.has(surveyTeam.uid)) {
      this.teamsSeen.add(surveyTeam.uid);
      res.push({
        model: 'survey_Team',
        record: surveyTeam,
      });
    }

    if (surveyUser && surveyTeam) {
      res.push({
        model: 'survey_TeamMembership',
        record: {
          member: _.pick(surveyUser, ['uid', 'source']),
          team: _.pick(surveyTeam, ['uid', 'source']),
        },
      });
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
    return res;
  }

  private processQuestionMetadata(
    ctx: StreamContext,
    tableId: any,
    row: any,
    source: string,
    config: SurveysConfig
  ): void {
    const questionCategoryMapping = this.questionCategoryMapping(ctx);
    const surveyId = Surveys.getSurveyId(tableId);
    const questionWithMetadata = this.getQuestionsWithMetadata(
      row,
      questionCategoryMapping,
      source,
      config,
      surveyId
    );
    this.questionMetadata.set(questionWithMetadata.uid, questionWithMetadata);
  }

  /** Upsert surveys to add stats and survey questions records to include metadata (question category and response type) **/
  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const updateRecords = [];
    // Add survey questions upsert mutations
    this.questionMetadata.forEach((surveyQuestion) => {
      const questionRecord = {
        model: 'survey_Question__Update',
        record: {
          at: Date.now(),
          where: {uid: surveyQuestion.uid, source: surveyQuestion.source},
          mask: ['questionCategory', 'responseType'],
          patch: {
            questionCategory: surveyQuestion.questionCategory,
            responseType: surveyQuestion.responseType,
          },
        },
      };
      updateRecords.push(questionRecord);
    });

    this.surveyStats.forEach((surveyStats, surveyId) => {
      const surveyRecord = {
        model: 'survey_Survey__Update',
        record: {
          at: Date.now(),
          where: {uid: surveyId, source: this.streamName.source},
          mask: ['stats'],
          patch: {
            stats: surveyStats,
          },
        },
      };
      updateRecords.push(surveyRecord);
    });

    this.surveyMetadata.forEach((survey) => {
      updateRecords.push({
        model: 'survey_Survey__Update',
        record: {
          at: Date.now(),
          where: {
            uid: survey.uid,
            source: this.streamName.source,
          },
          mask: [
            'name',
            'description',
            'type',
            'status',
            'startedAt',
            'endedAt',
          ],
          patch: {
            name: survey.name,
            description: survey.description,
            type: survey.type,
            status: survey.status,
            startedAt: survey.startedAt,
            endedAt: survey.endedAt,
          },
        },
      });
    });

    return updateRecords;
  }

  private getQuestionsWithMetadata(
    row: any,
    questionCategoryMapping: QuestionCategoryMapping,
    source: string,
    config: SurveysConfig,
    surveyId: string
  ) {
    const questionCategory = AirtableConverter.toCategoryDetail(
      SurveyQuestionCategory,
      row[config.column_names_mapping.question_category_column_name],
      questionCategoryMapping
    );
    const responseType = AirtableConverter.toCategoryDetail(
      SurveyResponseCategory,
      row[config.column_names_mapping.response_type_column_name]
    );
    const question = row[config.column_names_mapping.question_column_name];
    const questionId = Surveys.createQuestionUid(question, surveyId);
    return {
      uid: questionId,
      source: source,
      questionCategory: questionCategory,
      responseType: responseType,
    };
  }

  private getSurveyQuestionRecords(
    questions: string[],
    tableId: string,
    recordId: string,
    submittedAt: string,
    row: any,
    config: SurveysConfig,
    source: string,
    surveyUser?: SurveyUser,
    surveyTeam?: SurveyTeam
  ) {
    return questions.flatMap((question, index) => {
      const surveyRecord = this.getSurveyRecord(row, config, tableId, source);
      const questionId = Surveys.createQuestionUid(question, surveyRecord.uid);
      const questionRecord = {
        uid: questionId,
        question: question,
        description: question,
        source,
      };
      const surveyQuestionAssociationRecord = {
        survey: {uid: surveyRecord.uid, source},
        question: {uid: questionRecord.uid, source},
        order: index + 1,
      };
      const questionResponse = {
        model: 'survey_QuestionResponse',
        record: {
          uid: recordId,
          source,
          submittedAt,
          response: row[question].toString(),
          surveyQuestion: {
            survey: {uid: surveyRecord.uid, source},
            question: {uid: questionRecord.uid, source},
          },
          respondent: surveyUser ? {uid: surveyUser.uid, source} : null,
          team: surveyTeam ? {uid: surveyTeam.uid, source} : null,
        },
      };

      const res: DestinationRecord[] = [questionResponse];

      if (!this.questionsSeen.has(questionRecord.uid)) {
        this.questionsSeen.add(questionRecord.uid);
        res.push(
          ...[
            {
              model: 'survey_Question',
              record: questionRecord,
            },
            {
              model: 'survey_SurveyQuestionAssociation',
              record: surveyQuestionAssociationRecord,
            },
          ]
        );
      }

      if (!this.surveysSeen.has(surveyRecord.uid)) {
        this.surveysSeen.add(surveyRecord.uid);
        res.push({
          model: 'survey_Survey',
          record: surveyRecord,
        });
      }

      return res;
    });
  }

  private getSurveyRecord(
    row: any,
    config: SurveysConfig,
    tableId: string,
    source: string
  ): Survey {
    const surveyId = Surveys.getSurveyId(tableId);
    const surveyData = this.getSurveyData(config, row);
    return {
      uid: surveyId,
      source,
      status: surveyData.status
        ? AirtableConverter.toCategoryDetail(
            SurveyStatusCategory,
            surveyData.status
          )
        : null,
      type: surveyData.type
        ? AirtableConverter.toCategoryDetail(SurveyCategory, surveyData.type)
        : null,
      name: surveyData.name,
      description: surveyData.description,
      startedAt: surveyData.startedAt ? toDate(surveyData.startedAt) : null,
      endedAt: surveyData.endedAt ? toDate(surveyData.endedAt) : null,
    };
  }

  private updateSurveyStats(surveyId: string, questions: string[]) {
    const stats = this.surveyStats.get(surveyId) || {
      questionCount: questions.length,
      invitationCount: 0, // Invitation count is left at 0 as we don't have this data from Airtable
      responseCount: 0,
    };
    stats.responseCount += 1;
    this.surveyStats.set(surveyId, stats);
  }

  private getFilteredQuestions(row: any, config: SurveysConfig) {
    return Object.keys(row).filter(
      (question) =>
        ![
          config.column_names_mapping.survey_name_column_name,
          config.column_names_mapping.survey_type_column_name,
          config.column_names_mapping.survey_description_column_name,
          config.column_names_mapping.survey_started_at_column_name,
          config.column_names_mapping.survey_ended_at_column_name,
          config.column_names_mapping.survey_status_column_name,
          config.column_names_mapping.name_column_name,
          config.column_names_mapping.email_column_name,
          config.column_names_mapping.team_column_name,
        ].includes(question)
    );
  }

  private getSurveyData(
    config: SurveysConfig,
    row: any
  ): {
    name: string | null;
    type: string | null;
    description: string | null;
    startedAt: string | null;
    endedAt: string | null;
    status: string | null;
  } {
    return {
      name: row[config.column_names_mapping.survey_name_column_name] ?? null,
      type: row[config.column_names_mapping.survey_type_column_name] ?? null,
      description:
        row[config.column_names_mapping.survey_description_column_name] ?? null,
      startedAt:
        row[config.column_names_mapping.survey_started_at_column_name] ?? null,
      endedAt:
        row[config.column_names_mapping.survey_ended_at_column_name] ?? null,
      status:
        row[config.column_names_mapping.survey_status_column_name] ?? null,
    };
  }

  private getSurveyUser(
    row: any,
    config: SurveysConfig,
    source: string
  ): SurveyUser | undefined {
    const uid = row[config.column_names_mapping.email_column_name];

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      source,
      email: uid,
      name: row[config.column_names_mapping.name_column_name] ?? null,
    };
  }

  private getSurveyTeam(
    row: any,
    config: SurveysConfig,
    source: string
  ): SurveyTeam | undefined {
    const uid = Surveys.getTeamUid(
      row[config.column_names_mapping.team_column_name]
    );

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      name: row[config.column_names_mapping.team_column_name],
      source,
    };
  }
}
