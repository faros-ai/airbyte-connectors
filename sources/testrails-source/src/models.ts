import {DateTime} from 'luxon';

export interface TimeWindow {
  before?: DateTime;
  after?: DateTime;
}
