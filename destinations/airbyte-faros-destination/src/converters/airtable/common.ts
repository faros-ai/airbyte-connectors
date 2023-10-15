import {createHash} from 'crypto';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  QuestionCategoryMapping,
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyQuestionCategoryType,
  SurveyResponseCategory,
  SurveyResponseType,
  SurveyType,
} from './models';

export abstract class AirtableConverter extends Converter {
  source = 'Airtable';
  id(record: AirbyteRecord): any {
    return record?.record?.data?._airtable_id;
  }

  // TODO: Move this to faros-js-client utils
  static toCategoryDetail<T extends {Custom: any}>(
    enumObject: T,
    category: string,
    categoryMapping: Record<string, string> = {}
  ): {
    category: T[keyof T];
    detail: string;
  } {
    const enumSymbol =
      enumObject[category] ?? enumObject[categoryMapping[category]];
    if (enumSymbol) {
      return {
        category: enumSymbol,
        detail: category,
      };
    }

    return {
      category: enumObject.Custom,
      detail: category,
    };
  }

  static getTeamUidFromTeamName(teamName: string): string {
    return teamName.toLowerCase().split(' ').join('_');
  }

  static getSurveyId(fqTableId: string): string {
    // Get the first part of the fully qualified table id, which corresponds to the Airtable base id
    // E.g., appwVNmuUAPCIxzSZ/tblWFFSCLxi0gVtkU -> appwVNmuUAPCIxzSZ
    return fqTableId.split('/')[0];
  }

  static createQuestionUid(question: string, surveyId: string) {
    return `${surveyId}-${createHash('sha256').update(question).digest('hex')}`;
  }
}
