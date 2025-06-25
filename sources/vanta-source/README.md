# Vanta Source

This is the repository for the Vanta source connector, written in Typescript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

The source is currently primarily used to get vulnerabilities.
Within the config, the option 'queryTypes' defines which queries will be used
to fetch vulnerabilities from Vanta.
* gitv2 maps to resources/GithubDependabotVulnerabilityV2List.gql
* awsv2 maps to resources/AwsContainerVulnerabilityV2List.gql
When queryTypes contains all three ("gitv2", "awsv2"), then all
three queries are called and sent to the destination.