import {CategoryDetail} from '../common/common';

export interface TaskKey {
  uid: string;
  source: string;
}

export interface TaskStatusChange {
  status: CategoryDetail;
  changedAt: Date;
}
