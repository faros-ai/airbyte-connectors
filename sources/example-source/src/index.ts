import commander, {Command} from 'commander';
import path from 'path';

import {AirbyteLogger} from './logger';
import {PACKAGE_VERSION} from './utils';

const logger = new AirbyteLogger();
/** The main entry point. */
export function mainCommand(): commander.Command {
  return new Command()
    .name('main')
    .version('v' + PACKAGE_VERSION)
    .addCommand(specCommand())
    .addCommand(checkCommand())
    .addCommand(discoverCommand())
    .addCommand(readCommand());
}

function specCommand(): commander.Command {
  return new Command()
    .command('spec')
    .description('spec command')
    .alias('s')
    .action(() => {
      const spec = require('../resources/spec.json');

      // Expected output
      logger.writeSpec(spec);
    });
}

function checkCommand(): commander.Command {
  return new Command()
    .command('check')
    .description('check command')
    .alias('c')
    .requiredOption('--config <path to json>', 'config json')
    .action((opts: {config: string}) => {
      const config = require(path.resolve(opts.config));
      const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';

      // Expected output
      logger.writeConnectionStatus({status});
    });
}

function discoverCommand(): commander.Command {
  return new Command()
    .command('discover')
    .description('discover command')
    .alias('d')
    .requiredOption('--config <path to json>', 'config json')
    .action(() => {
      const catalog = require('../resources/catalog.json');

      // Expected output
      logger.writeCatalog(catalog);
    });
}

function newBuild(idx: number): any {
  return {
    uid: 'uid' + idx,
    source: 'Jenkins',
    fields: {
      command: 'command ' + idx,
      number: Date.now(),
    },
    additional_fields: [
      {
        name: 'key' + idx,
        value: Date.now(),
        nested: {
          value: 'nested' + idx,
        },
      },
      {
        name: 'static',
        value: 'static',
        nested: {
          value: 'static',
        },
      },
    ],
  };
}

function readCommand(): commander.Command {
  return new Command()
    .command('read')
    .description('read command')
    .alias('r')
    .requiredOption('--config <path to json>', 'config json')
    .requiredOption('--catalog <path to json>', 'catalog json')
    .option('--state <path to json>', 'state json')
    .action((opts: {config: string; catalog: string; state?: string}) => {
      const config = require(path.resolve(opts.config));
      const catalog = require(path.resolve(opts.catalog));
      logger.info('config: ' + JSON.stringify(config));
      logger.info('catalog: ' + JSON.stringify(catalog));
      if (opts.state) {
        const state = require(path.resolve(opts.state));
        logger.info('prev state: ' + JSON.stringify(state));
      }
      logger.info('Syncing stream: jenkins_builds');
      const numBuilds = 5;
      for (let i = 0; i < numBuilds; i++) {
        // Write record to be consumed by destination
        logger.writeRecord('jenkins_builds', 'faros', newBuild(i));
      }
      logger.info(`Synced ${numBuilds} records from stream jenkins_builds`);

      // Write state for next sync
      logger.writeState({cutoff: Date.now()});
    });
}
