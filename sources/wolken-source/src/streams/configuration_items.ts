import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {ConfigurationItem} from 'faros-airbyte-common/wolken';
import {Dictionary} from 'ts-essentials';

import {Wolken, WolkenConfig} from '../wolken';

export class ConfigurationItems extends AirbyteStreamBase {
  constructor(
    private readonly config: WolkenConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/configuration_items.json');
  }

  get primaryKey(): string {
    return 'ciId';
  }

  async *readRecords(): AsyncGenerator<ConfigurationItem> {
    const wolken = Wolken.instance(this.config, this.logger);
    if (Array.isArray(this.config.configuration_items_type_ids) && this.config.configuration_items_type_ids.length > 0) {
      for (const typeId of this.config.configuration_items_type_ids) {
        yield* wolken.getConfigurationItems(typeId);
      }
      return;
    }
    yield* wolken.getConfigurationItems();
  }
}
