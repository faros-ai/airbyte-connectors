// code for 'Vulns' class:
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {VantaConfig} from '..';
import {Vanta} from '../vanta';

export class Vulnerabilities extends AirbyteStreamBase {
  constructor(
    private readonly cfg: VantaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/vulnerabilities.json');
  }
  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {
    const vanta = await Vanta.instance(this.cfg, this.logger);
    for await (const vuln of vanta.getVulnerabilities()) {
      yield {
        recordType: 'vulnerability',
        data: vuln,
      };
    }
    for await (const vulnRemediation of vanta.getVulnerabilityRemediations()) {
      yield {
        recordType: 'vulnerability-remediation',
        data: vulnRemediation,
      };
    }
  }

  async onBeforeRead(): Promise<void> {
    const vanta = await Vanta.instance(this.cfg, this.logger);
    const resources = await vanta.getAllResources();

    // Initialize a map to store resourceId -> displayName mappings
    this.cfg.resourceIdToNameMap = new Map<string, string>();

    // Populate the map with resourceId and displayName from resources
    for (const [resourceId, resourceData] of resources.entries()) {
      const displayName =
        resourceData?.displayName || resourceData?.name || 'Unknown';
      this.cfg.resourceIdToNameMap.set(resourceId, displayName);
    }

    this.logger.info(
      `Loaded ${this.cfg.resourceIdToNameMap.size} resource ID to displayName mappings`
    );
  }
}
