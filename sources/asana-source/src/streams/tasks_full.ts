import {Tasks} from './tasks';

export class TasksFull extends Tasks {
  get supportsIncremental(): boolean {
    return false;
  }
}
