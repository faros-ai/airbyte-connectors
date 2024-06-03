#!/bin/sh

# Assign 75% of available memory to nodejs heap
TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_MB=$(($TOTAL_MEM / 1024))
MAX_OLD_SPACE_SIZE=$(($TOTAL_MEM_MB * 75 / 100))

export NODE_OPTIONS="--max-old-space-size=$MAX_OLD_SPACE_SIZE"
exec "/home/node/airbyte/main" "$@"
