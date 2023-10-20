import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {AirtableConverter} from './common';
import {SurveysCommon} from "../common/surveys/surveys_common";

export class Surveys extends AirtableConverter {
  private surveys: SurveysCommon;

  constructor() {
    super();
    this.surveys = new SurveysCommon(this.streamName, this.source);
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'survey_Survey',
    'survey_Question',
    'survey_SurveyQuestionAssociation',
    'survey_QuestionResponse',
    'survey_User',
    'survey_Team',
    'survey_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.surveys.initialize(ctx);

    const row = record?.record?.data?.row;
    const fqTableId: string = record?.record?.data?._airtable_table_id;
    const fqTableName: string = record?.record?.data?._airtable_table_name;

    if (!row || !fqTableId || !fqTableName) {
      return [];
    }

    const surveyId = Surveys.getBaseId(fqTableId);
    const tableName = Surveys.getTableName(fqTableName);

    // Be a bit more lenient with table names matching
    const normalizeTableName = (tableName: string): string => {
      return tableName.toLowerCase().split(' ').join('_');
    };

    // Question metadata
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.surveys.config.question_metadata_table_name)
    ) {
      this.surveys.processQuestionMetadata(surveyId, row);
      return [];
    }

    // Survey metadata
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.surveys.config.survey_metadata_table_name)
    ) {
      this.surveys.processSurveyMetadata(surveyId, row);
      return [];
    }

    // Survey response
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.surveys.config.survey_responses_table_name)
    ) {
      const responseId = this.id(record);
      const submittedAt = record?.record?.data?._airtable_created_time;

      const questions = this.surveys.getFilteredQuestions(row);
      const res = this.surveys.processResponse(
        surveyId,
        row,
        responseId,
        submittedAt,
        questions
      );

      // Update survey stats for pushing on processing complete
      this.surveys.updateSurveyStats(surveyId, questions);

      return res;
    }

    return [];
  }

  /** Call surveys onProcessingComplete to add survey stats and metadata, and questions metadata (question category and response type) **/
  async onProcessingComplete(ctx: StreamContext): Promise<ReadonlyArray<DestinationRecord>> {
    return this.surveys.onProcessingComplete(ctx);
  }
}
