import {AirbyteRecord} from 'faros-airbyte-cdk';

import {SurveysCommon} from '../common/surveys/surveys_common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {SheetsConverter} from './common';

export class Surveys extends SheetsConverter {
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
    const sheetId: string = record?.record?.data?.sheetId;
    const sheetName: string = record?.record?.data?.sheetName;

    if (!row || !sheetId || !sheetName) {
      return [];
    }

    // Be a bit more lenient with sheet names matching
    const normalizeSheetName = (sheetName: string): string => {
      return sheetName.toLowerCase().split(' ').join('_');
    };

    // Question metadata
    if (
      normalizeSheetName(sheetName) ===
      normalizeSheetName(this.surveys.config.question_metadata_table_name)
    ) {
      this.surveys.processQuestionMetadata(sheetId, row);
      return [];
    }

    // Survey metadata
    if (
      normalizeSheetName(sheetName) ===
      normalizeSheetName(this.surveys.config.survey_metadata_table_name)
    ) {
      this.surveys.processSurveyMetadata(sheetId, row);
      return [];
    }

    // Survey response
    if (
      normalizeSheetName(sheetName) ===
      normalizeSheetName(this.surveys.config.survey_responses_table_name)
    ) {
      const responseId = this.id(record);
      // TODO: get submittedAt from the sheet row as record data doesn't have it
      const submittedAt = record?.record?.data?._airtable_created_time;

      const questions = this.surveys.getFilteredQuestions(row);
      const res = this.surveys.processResponse(
        sheetId,
        row,
        responseId,
        submittedAt,
        questions
      );

      // Update survey stats for pushing on processing complete
      this.surveys.updateSurveyStats(sheetId, questions);

      return res;
    }

    return [];
  }

  /** Call surveys onProcessingComplete to add survey stats and metadata, and questions metadata (question category and response type) **/
  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.surveys.onProcessingComplete(ctx);
  }
}
