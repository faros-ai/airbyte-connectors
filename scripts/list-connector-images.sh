#!/usr/bin/env bash
#
# Generate list of connector image tags with metadata
#
# Usage: list-connector-images.sh <version> <output-file>
#   version     - Version tag to use (e.g., 1.0.0)
#   output-file - Path to output file where tags will be written
#
# Output format (space-separated: connector_path version_tag latest_tag):
#   sources/github-source/ farosai/airbyte-github-source:1.0.0 farosai/airbyte-github-source:latest
#   sources/jira-source/ farosai/airbyte-jira-source:1.0.0 farosai/airbyte-jira-source:latest
#   ...
#
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Error: Version not specified" >&2
  exit 1
fi

if [ -z "${2:-}" ]; then
  echo "Error: Output file not specified" >&2
  exit 1
fi

version=$1
output_file=$2

# Clear output file
> "$output_file"

org="farosai"
prefix="airbyte-"

echo "Generating connector image tags for version: $version"

for connector_path in $(ls -d sources/*/ destinations/*/); do
  # Normalize connector path (add trailing slash if missing)
  [[ "${connector_path}" != */ ]] && connector_path="${connector_path}/"

  # Extract connector name from path
  connector_name="$(echo $connector_path | cut -f2 -d'/')"

  # Build image name with org and prefix
  if [[ "$connector_name" = $prefix* ]]; then
    image="$org/$connector_name"
  else
    image="$org/$prefix$connector_name"
  fi

  # Create image tags
  version_tag="$image:$version"
  latest_tag="$image:latest"

  # Write space-separated entry to output file
  echo "$connector_path $version_tag $latest_tag" >> "$output_file"

  echo "  $connector_name -> $version_tag, $latest_tag"
done

echo "Generated $(wc -l < "$output_file" | tr -d ' ') connector entries in $output_file"
