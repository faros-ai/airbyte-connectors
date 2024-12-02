#!/usr/bin/env bash

# Example usage:
# export EXAMPLE_SOURCE_TEST_CONFIG='{"server_url":"http://localhost","token":"abc","user":"chris"}'
# ./scripts/source-acceptance-test.sh example-source

error() {
  echo -e "$@"
  exit 1
}

function write_test_config() {
  local connector_name=$1
  local test_config_name=$2
  local cred_filename=${3:-config.json}
  local test_config=${!test_config_name}

  [ -z "$connector_name" ] && error "Empty connector name"

  local secrets_dir="sources/${connector_name}/secrets"
  local test_config_file="${secrets_dir}/${cred_filename}"
  if [ -f "$test_config_file" ]; then
    echo "Skipped writing ${test_config_file} since it already exists"
    return
  fi

  if [ -z "$test_config" ]; then
    echo "$test_config_name env var is not set"
    return
  fi

  echo "Writing ${test_config_file}"
  mkdir -p "$secrets_dir"
  echo "$test_config" > "$test_config_file"
}

if [ -z "$1" ]; then
  error "Source not specified"
fi
source=$1

failed=false
path="sources/$source"
tag=$(echo $path | cut -f2 -d'/')
echo Found source $tag
log=acceptance-test-$tag.log

# Test config should be set with env var {NAME}_TEST_CONFIG
# e.g. EXAMPLE_SOURCE_TEST_CONFIG
test_config_env_var=$(echo "${tag//-/_}" | \
  awk '{ str=sprintf("%s_TEST_CONFIG", $0); print toupper(str) }')
write_test_config $tag $test_config_env_var

echo Building source image $tag
version=$(jq -r '.version' "$path/package.json")
docker build . --build-arg path=$path --build-arg version=$version --pull -t $tag
docker pull airbyte/source-acceptance-test:latest
echo Running source acceptance tests against $tag
docker run --rm -t \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  -v $(pwd)/$path:/test_input \
  airbyte/source-acceptance-test:latest \
  --acceptance-test-config /test_input > $log
  cat $log
  if grep -q -e FAILED -e ERROR -e pytest.outcomes.Exit "$log"; then
    echo $tag failed source acceptance tests
    failed=true
  else
    echo $tag passed source acceptance tests
  fi

if [ $failed = "true" ]; then
  exit 1
fi
