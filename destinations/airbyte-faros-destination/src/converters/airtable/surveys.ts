import {createHash} from 'crypto';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';
import {AirtableConverter} from './common';
import {
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

type QuestionCategoryMapping = Record<string, string>;

type ColumnNameMapping = {
  survey_name_column_name?: string;
  survey_type_column_name?: string;
  survey_description_column_name?: string;
  survey_started_at_column_name?: string;
  survey_ended_at_column_name?: string;
  name_column_name?: string;
  email_column_name?: string;
  team_column_name?: string;
  question_category_column_name?: string;
  response_type_column_name?: string;
  question_column_name?: string;
};

interface SurveysConfig {
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

  private surveyQuestionsWithMetadata: SurveyQuestion[] = [];
  private surveyRecordWithMetadata: Survey;
  private surveysWithStats: Map<string, SurveyStats> = new Map();
  private usersSeen = new Set<string>();
  private teamsSeen = new Set<string>();

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
    // Check if row is a question metadata row for pushing it to survey questions metadata records
    if (
      row[config.column_names_mapping.question_column_name] &&
      row[config.column_names_mapping.question_category_column_name]
    ) {
      const questionCategoryMapping = this.questionCategoryMapping(ctx);
      const surveyId = this.getSurveyId(tableId);
      const questionWithMetadata = this.getQuestionsWithMetadata(
        row,
        questionCategoryMapping,
        source,
        config,
        surveyId
      );
      this.surveyQuestionsWithMetadata.push(questionWithMetadata);
      return [];
    }

    const questions = this.getFilteredQuestions(row, config);

    // check if row contains survey metadata for pushing survey records
    // include questions empty array check to make sure row comes from table with no questions (survey data only)
    if (
      row[config.column_names_mapping.survey_name_column_name] &&
      row[config.column_names_mapping.survey_type_column_name] &&
      questions.length === 0
    ) {
      this.surveyRecordWithMetadata = this.getSurveyRecord(
        row,
        config,
        tableId,
        source
      );
      return [];
    }

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

    // Update survey stats for pushing on processing complete
    const surveyId = this.getSurveyId(tableId);
    this.updateSurveyStats(surveyId, questions);

    return res;
  }

  /** Upsert surveys to add stats and survey questions records to include metadata (question category and response type) **/
  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const updateRecords = [];
    // Add survey questions upsert mutations
    this.surveyQuestionsWithMetadata.forEach((surveyQuestion) => {
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

    this.surveysWithStats.forEach((surveyStats, surveyId) => {
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

    if (this.surveyRecordWithMetadata) {
      updateRecords.push({
        model: 'survey_Survey__Update',
        record: {
          at: Date.now(),
          where: {
            uid: this.surveyRecordWithMetadata.uid,
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
            name: this.surveyRecordWithMetadata.name,
            description: this.surveyRecordWithMetadata.description,
            type: this.surveyRecordWithMetadata.type,
            status: this.surveyRecordWithMetadata.status,
            startedAt: this.surveyRecordWithMetadata.startedAt,
            endedAt: this.surveyRecordWithMetadata.endedAt,
          },
        },
      });
    }

    return updateRecords;
  }

  private getQuestionsWithMetadata(
    row: any,
    questionCategoryMapping: QuestionCategoryMapping,
    source: string,
    config: SurveysConfig,
    surveyId: string
  ) {
    const questionCategory = this.getQuestionCategory(
      row[config.column_names_mapping.question_category_column_name],
      questionCategoryMapping
    );
    const responseType = this.getResponseType(
      row[config.column_names_mapping.response_type_column_name]
    );
    const question = row[config.column_names_mapping.question_column_name];
    const questionId = this.createQuestionUid(question, surveyId);
    return {
      uid: questionId,
      source: source,
      questionCategory: questionCategory,
      responseType: responseType,
    };
  }

  /** Get team uid from team name assuming team name received is the equivalent of snake case uid */
  private getTeamUidFromTeamName(teamName: string) {
    return teamName.toLowerCase().split(' ').join('-');
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
      // If id column is not specified and default column name has no value, default to airtable id
      const surveyRecord = this.getSurveyRecord(row, config, tableId, source);
      // Generate digest from question text to create uid
      const questionId = this.createQuestionUid(question, surveyRecord.uid);
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
      return [
        questionResponse,
        {
          model: 'survey_Survey',
          record: surveyRecord,
        },
        {
          model: 'survey_Question',
          record: questionRecord,
        },
        {
          model: 'survey_SurveyQuestionAssociation',
          record: surveyQuestionAssociationRecord,
        },
      ];
    });
  }

  private getSurveyRecord(
    row: any,
    config: SurveysConfig,
    tableId: string,
    source: string
  ): Survey {
    const surveyId = this.getSurveyId(tableId);
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
      ...surveyData,
    };
  }

  private getSurveyId(tableId: string) {
    return tableId.split('/')[0]; // Get base id only, by removing the table id that comes before slash e.g. appwVNmuUAPCIxzSZ/tblWFFSCLxi0gVtkU
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
    // Check if category was mapped to a Faros category
    const farosMappedCategory = SurveyQuestionCategory[mappedCategory];
    if (farosMappedCategory) {
      return {
        category: farosMappedCategory,
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

  createQuestionUid(question: string, surveyId: string) {
    return `${surveyId}-${createHash('sha256').update(question).digest('hex')}`;
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
          config.column_names_mapping.survey_name_column_name,
          config.column_names_mapping.survey_type_column_name,
          config.column_names_mapping.survey_description_column_name,
          config.column_names_mapping.survey_started_at_column_name,
          config.column_names_mapping.survey_ended_at_column_name,
          config.column_names_mapping.name_column_name,
          config.column_names_mapping.email_column_name,
          config.column_names_mapping.team_column_name,
        ].includes(question)
    );
  }

  private getSurveyData(config: SurveysConfig, row: any) {
    return {
      name: row[config.column_names_mapping.survey_name_column_name] ?? null,
      type: this.getSurveyType(
        row[config.column_names_mapping.survey_type_column_name] ?? null
      ),
      description:
        row[config.column_names_mapping.survey_description_column_name] ?? null,
      startedAt:
        row[config.column_names_mapping.survey_started_at_column_name] ?? null,
      endedAt:
        row[config.column_names_mapping.survey_ended_at_column_name] ?? null,
    };
  }

  private getSurveyUser(
    row: any,
    config: SurveysConfig,
    source: string
  ): SurveyUser | undefined {
    if (row[config.column_names_mapping.email_column_name]) {
      const surveyUser: SurveyUser = {
        uid: row[config.column_names_mapping.email_column_name],
        email: row[config.column_names_mapping.email_column_name],
        name: row[config.column_names_mapping.name_column_name] ?? null,
        source,
      };
      return surveyUser;
    }
    return undefined;
  }

  private getSurveyTeam(
    row: any,
    config: SurveysConfig,
    source: string
  ): SurveyTeam | undefined {
    if (row[config.column_names_mapping.team_column_name]) {
      const teamUid = this.getTeamUidFromTeamName(
        row[config.column_names_mapping.team_column_name]
      );

      const surveyTeam: SurveyTeam = {
        uid: teamUid,
        name: row[config.column_names_mapping.team_column_name],
        description: row[config.column_names_mapping.team_column_name] ?? null,
        source,
      };
      return surveyTeam;
    }
    return undefined;
  }
}
