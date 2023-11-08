export type Survey = {
  uid: string;
  name: string;
  description: string;
  type: SurveyType;
  status: SurveyStatus;
  startedAt: Date;
  endedAt: Date;
  creator?: SurveyUser;
  stats?: SurveyStats;
  source: string;
};

export type SurveyQuestion = {
  uid: string;
  question?: string;
  description?: string;
  questionCategory: SurveyQuestionCategoryType;
  responseType: SurveyResponseType;
  source: string;
};

export type SurveyQuestionAssociation = {
  survey: Survey;
  question: SurveyQuestion;
  order: number;
};

export type SurveyStats = {
  questionCount: number;
  invitationCount: number;
  responseCount: number;
};

export type SurveyUser = {
  uid: string;
  email: string;
  name: string;
  source: string;
};

export type SurveyTeam = {
  uid: string;
  name: string;
  description?: string;
  source: string;
};

export type SurveyType = {
  category: SurveyCategory;
  detail: string;
};

export enum SurveyCategory {
  ENPS = 'ENPS',
  NPS = 'NPS',
  Satisfaction = 'Satisfaction',
  Custom = 'Custom',
}

export type SurveyStatus = {
  category: SurveyStatusCategory;
  detail: string;
};

export enum SurveyStatusCategory {
  Completed = 'Completed',
  Canceled = 'Canceled',
  Planned = 'Planned',
  InProgress = 'InProgress',
  Custom = 'Custom',
}

export type SurveyQuestionCategoryType = {
  category: SurveyQuestionCategory;
  detail: string;
};

export enum SurveyQuestionCategory {
  AlignmentAndGoals = 'AlignmentAndGoals',
  DeveloperProductivity = 'DeveloperProductivity',
  ENPS = 'ENPS',
  NPS = 'NPS',
  Quality = 'Quality',
  Satisfaction = 'Satisfaction',
  SpeedAndAgility = 'SpeedAndAgility',
  CodingAssistants = 'CodingAssistants',
  Custom = 'Custom',
}

export type SurveyResponseType = {
  category: SurveyResponseCategory;
  detail: string;
};

export enum SurveyResponseCategory {
  Binary = 'Binary',
  LikertScale = 'LikertScale',
  MultipleChoice = 'MultipleChoice',
  NumericEntry = 'NumericEntry',
  OpenEnded = 'OpenEnded',
  RankOrder = 'RankOrder',
  Rating = 'Rating',
  Custom = 'Custom',
}

export type QuestionCategoryMapping = Record<string, string>;
