export class CommitHashMatcher {
  private sortedHashes: string[];

  constructor(hashes: Set<string>) {
    this.sortedHashes = Array.from(hashes).sort();
  }

  match(shortHash: string): string | null {
    let left = 0;
    let right = this.sortedHashes.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midHash = this.sortedHashes[mid];

      if (midHash.startsWith(shortHash)) {
        return midHash;
      } else if (midHash < shortHash) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return null;
  }
}
