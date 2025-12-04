#!/usr/bin/env bash

if [ -z "$1" ]; then
  echo "Error: Connector path not specified" >&2
  exit 1
fi
if [ -z "$2" ]; then
  echo "Error: Version tag not specified" >&2
  exit 1
fi
if [ -z "$3" ]; then
  echo "Error: Latest tag not specified" >&2
  exit 1
fi

connector_path=$1
version_tag=$2
latest_tag=$3

# Normalize connector path (add trailing slash if missing)
[[ "${connector_path}" != */ ]] && connector_path="${connector_path}/"

# Extract connector name and version from the provided tags
connector_version="${version_tag##*:}"
image="${version_tag%:*}"

echo "Publishing connector:"
echo "  Path: $connector_path"
echo "  Image: $image"
echo "  Version tag: $version_tag"
echo "  Latest tag: $latest_tag"

# Check if image already exists
docker manifest inspect "$version_tag" > /dev/null 2>&1
if [ "$?" == 0 ]; then
  echo "Image $version_tag already exists, skipping build and push"
  exit 0
fi

# Build and push the image
echo "Building image..."
docker build . \
  --build-arg path="$connector_path" \
  --build-arg version="$connector_version" \
  --pull \
  -t "$latest_tag" \
  -t "$version_tag" \
  --label "io.airbyte.version=$connector_version" \
  --label "io.airbyte.name=$image"

if [ $? -ne 0 ]; then
  echo "Error: Docker build failed for $connector_path" >&2
  exit 1
fi

echo "Pushing latest tag: $latest_tag"
docker push "$latest_tag"
if [ $? -ne 0 ]; then
  echo "Error: Failed to push $latest_tag" >&2
  exit 1
fi

echo "Pushing version tag: $version_tag"
docker push "$version_tag"
if [ $? -ne 0 ]; then
  echo "Error: Failed to push $version_tag" >&2
  exit 1
fi

echo "Successfully published $version_tag"
