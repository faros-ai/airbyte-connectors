import $RefParser from '@apidevtools/json-schema-ref-parser';
import {VError} from 'verror';

import {AirbyteSpec, Spec} from './protocol';

// Allows to load specs containing references to spec fragments
export class SpecLoader {
  static async loadSpec(specPath: string): Promise<AirbyteSpec> {
    try {
      const dereferenced = (await $RefParser.dereference(specPath)) as Spec;
      return new AirbyteSpec(dereferenced);
    } catch (err: any) {
      throw new VError(
        err,
        `Failed to load spec references for path ${specPath}`
      );
    }
  }
}
