import {mapValues} from 'lodash';
import {SyncRedactor} from 'redact-pii';
import {Dictionary} from 'ts-essentials';

export class RecordRedactor {
  private readonly redactor: SyncRedactor;

  constructor(
    private readonly redactCustomReplace: string | undefined = undefined,
    private readonly redactCustomRegex: ReadonlyArray<string> = []
  ) {
    const customRegexRedactors = this.redactCustomRegex.map((regex) => ({
      regexpPattern: new RegExp(regex, 'gi'),
      replaceWith: this.redactCustomReplace || 'REDACTED',
    }));
    this.redactor = new SyncRedactor({
      globalReplaceWith: this.redactCustomReplace,
      customRedactors: {
        before: [...customRegexRedactors],
      },
    });
  }

  redactRecord(
    record: Dictionary<any>,
    fieldsToRedact: ReadonlyArray<string>
  ): Dictionary<any> {
    return mapValues(record, (v, k) =>
      fieldsToRedact.includes(k) && typeof v === 'string'
        ? this.redactor.redact(v)
        : v
    );
  }
}
