#!/usr/bin/env bash

if [ -z "$1" ]; then
  error "Connector path not specified"
fi
if [ -z "$2" ]; then
  error "Connector version not specified"
fi
connector_path=$1
connector_version=$2

[[ "${connector_path}" != */ ]] && connector_path="${connector_path}/"

org="farosai"
connector_name="$(echo $connector_path | cut -f2 -d'/')"
prefix="airbyte-"
if [[ "$connector_name" = $prefix* ]]; then
  image="$org/$connector_name"
else
  image="$org/$prefix$connector_name"
fi

latest_tag="$image:latest"
version_tag="$image:$connector_version"
echo "Image version tag: $version_tag"

docker manifest inspect $version_tag > /dev/null
if [ "$?" == 1 ]; then
  docker buildx build . \
    --build-arg path=$connector_path \
    --build-arg version=$connector_version \
    --pull \
    --platform linux/amd64,linux/arm64 \
    -t $latest_tag \
    -t $version_tag \
    --label "io.airbyte.version=$connector_version" \
    --label "io.airbyte.name=$image" \
    --push
fi
