#!/usr/bin/env bash

error() {
  echo -e "$@"
  exit 1
}

function write_standard_creds() {
  local connector_name=$1
  local creds=$2
  local cred_filename=${3:-config.json}

  [ -z "$connector_name" ] && error "Empty connector name"

  local secrets_dir="sources/${connector_name}/secrets"
  mkdir -p "$secrets_dir"
  echo "$creds" > "${secrets_dir}/${cred_filename}"
}

write_standard_creds example-source "$EXAMPLE_SOURCE_TEST_CREDS"

failed=false

for i in $(ls -d sources/*/)
do
  path=$(echo ${i%%/})
  echo Found source at $path
  tag=$(echo $path | cut -f2 -d'/')
  echo $tag
  log=$tag-test.log
  echo Building source image $tag
  docker build . --build-arg path=$path -t $tag
  echo Running source acceptance tests against $tag
  docker run --rm -it \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /tmp:/tmp \
    -v $(pwd)/$path:/test_input \
    airbyte/source-acceptance-test \
    --acceptance-test-config /test_input > $log
    if grep -q FAILED "$log"; then
      echo $tag failed source acceptance tests
      cat $log
      failed=true
    else
      echo $tag passed source acceptance tests
    fi
done

if [ $failed = "true" ]; then
  exit 1
fi
