#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Error: docker image reference (e.g. farosai/airbyte-xyz:1.0.0) is required" >&2
  exit 1
fi

IMAGE_WITH_TAG="$1"
if [[ "${IMAGE_WITH_TAG}" != *:* ]]; then
  echo "Error: docker image reference must include a tag" >&2
  exit 1
fi

IMAGE="docker.io/${IMAGE_WITH_TAG}"
echo "Inspecting remote image: ${IMAGE}"
DIGEST=$(skopeo inspect --raw "docker://${IMAGE}" | sha256sum | awk '{print $1}')
if [ -z "${DIGEST}" ]; then
  echo "Error: Failed to determine digest for ${IMAGE}" >&2
  exit 1
fi

IMAGE_REF="${IMAGE_WITH_TAG}@sha256:${DIGEST}"
echo "Signing image: ${IMAGE_REF}"
cosign sign --yes "${IMAGE_REF}"

echo "Verifying image: ${IMAGE_REF}"
MAX_ATTEMPTS=2
ATTEMPT=1
SLEEP_SECONDS=5
while true; do
  sleep "${SLEEP_SECONDS}"
  if [ "${ATTEMPT}" -gt "${MAX_ATTEMPTS}" ]; then
    echo "Error: Verification failed after ${ATTEMPT} attempts for ${IMAGE_REF}" >&2
    exit 1
  fi

  if cosign verify "${IMAGE_REF}" \
    --certificate-identity-regexp="https://github.com/faros-ai/airbyte-connectors/.*" \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com"; then
    echo "Verification succeeded for ${IMAGE_REF}"
    break
  fi

  echo "Verification failed (attempt ${ATTEMPT}/${MAX_ATTEMPTS}). Retrying in ${SLEEP_SECONDS} seconds."
  ATTEMPT=$(( ATTEMPT + 1 ))
done
