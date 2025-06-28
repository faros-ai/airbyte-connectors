# Source Connector to hold Data Quality Tests

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

* Tests written in src/graphdoctor/graphdoctor.ts
* All tests along with the summary are all included in a single stream: "data-quality-tests"
* Data is synced in incremental mode in order to keep previous records