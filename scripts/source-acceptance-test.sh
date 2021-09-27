#!/usr/bin/env bash

# Example usage:
# export EXAMPLE_SOURCE_TEST_CREDS='{"server_url":"http://localhost","token":"abc","user":"chris"}'
# ./scripts/source-acceptance-test.sh example-source

error() {
  echo -e "$@"
  exit 1
}

function write_standard_creds() {
  local connector_name=$1
  local creds_name=$2
  local cred_filename=${3:-config.json}
  local creds=${!creds_name}

  [ -z "$connector_name" ] && error "Empty connector name"

  local secrets_dir="sources/${connector_name}/secrets"
  local creds_file="${secrets_dir}/${cred_filename}"
  if [ -f "$creds_file" ]; then
    echo "Skipped writing ${creds_file} since it already exists"
    return
  fi

  [ -z "$creds" ] && error "Env var $creds_name not set for $connector_name"

  echo "Writing ${creds_file}"
  mkdir -p "$secrets_dir"
  echo "$creds" > "$creds_file"
}

if [ -z "$1" ]; then
  error "Source not specified"
fi
source=$1

failed=false
path="sources/$source"
tag=$(echo $path | cut -f2 -d'/')
echo Found source $tag
log=$tag-acceptance-test.log

# Creds should be set with env var {NAME}_TEST_CREDS
# e.g. EXAMPLE_SOURCE_TEST_CREDS
creds_env_var=$(echo "${tag//-/_}" | \
  awk '{ str=sprintf("%s_test_creds", $0); print toupper(str) }')
write_standard_creds $tag $creds_env_var

echo Building source image $tag
docker build . --build-arg path=$path -t $tag
echo Running source acceptance tests against $tag
docker run --rm -t \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  -v $(pwd)/$path:/test_input \
  airbyte/source-acceptance-test \
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
