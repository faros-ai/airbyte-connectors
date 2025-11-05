#!/bin/sh

# Assign 75% of available memory to nodejs heap
read_memory_limit_file() {
  file_path=$1
  if [ -f "$file_path" ]; then
    memory_limit=$(cat "$file_path")
    echo "$memory_limit"
  else
    echo ""
  fi
}

get_container_memory_limit() {
  CGROUP_MEMORY_LIMIT_FILES="
    /sys/fs/cgroup/memory/memory.limit_in_bytes
    /sys/fs/cgroup/memory.max
    /sys/fs/cgroup/memory/memory.max_usage_in_bytes
  "

  for file_path in $CGROUP_MEMORY_LIMIT_FILES; do
    if [ -f "$file_path" ]; then
      memory_limit=$(read_memory_limit_file "$file_path")
      case $memory_limit in
      '' | *[!0-9]*) ;;
      *)
        echo "$memory_limit"
        return
        ;;
      esac
    fi
  done
  echo ""
}

memory_limit=$(get_container_memory_limit)
if [ -n "$memory_limit" ]; then
  memory_limit_mb=$(($memory_limit / 1024 / 1024))
  max_old_space_size=$(($memory_limit_mb * 75 / 100))
  export NODE_OPTIONS="--max-old-space-size=$max_old_space_size --require @opentelemetry/auto-instrumentations-node/register"
else
  export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
fi

exec "/home/node/airbyte/main" "$@"
