#!/usr/bin/env bash

if [ -z "$1" ]; then
  error "Connector path not specified"
fi
connector_path=$1

org="farosai"
connector_name="$(echo $connector_path | cut -f2 -d'/')"
prefix="airbyte-"
if [[ "$connector_name" = $prefix* ]]; then
  image="$org/$connector_name"
else
  image="$org/$prefix$connector_name"
fi

latest_tag="$image:latest"
connector_version=$(jq -r '.version' < ${connector_path}package.json)
version_tag="$image:$connector_version"
echo "Image version tag: $version_tag"

docker manifest inspect $version_tag > /dev/null
if [ "$?" == 1 ]; then
  docker build . \
    --build-arg path=$connector_path \
    -t $latest_tag \
    -t $version_tag \
    --label "io.airbyte.version=$connector_version" \
    --label "io.airbyte.name=$image"
  # docker push $latest_tag
  # docker push $version_tag
fi
