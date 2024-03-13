import {mapValues} from 'lodash';
import {SyncRedactor} from 'redact-pii';

import {DestinationRecord} from './converters/converter';

export class FarosDestinationRedactor {
  private readonly redactor: SyncRedactor;

  constructor(
    private readonly redactCustomReplace?: string,
    private readonly redactCustomRegex?: string
  ) {
    this.redactor = new SyncRedactor({
      globalReplaceWith: this.redactCustomReplace,
      ...(this.redactCustomRegex && {
        customRedactors: {
          before: [
            {
              regexpPattern: new RegExp(this.redactCustomRegex, 'gi'),
              replaceWith: this.redactCustomReplace || 'REDACTED',
            },
          ],
        },
      }),
    });
  }

  redactRecord(
    record: DestinationRecord['record'],
    fieldsToRedact: ReadonlyArray<string>
  ): DestinationRecord['record'] {
    return mapValues(record, (v, k) =>
      fieldsToRedact.includes(k) && typeof v === 'string'
        ? this.redactor.redact(v)
        : v
    );
  }
}
