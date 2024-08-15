import {AirbyteStreamBase} from 'faros-airbyte-cdk';

export abstract class StreamBase extends AirbyteStreamBase {}

export abstract class StreamWithWorkspaceSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<{workspace: string}> {
    yield;
    throw new Error('Method not implemented.');
  }
}

export abstract class StreamWithRepoSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<{
    workspace: string;
    repository: string;
  }> {
    yield;
    throw new Error('Method not implemented.');
  }
}
