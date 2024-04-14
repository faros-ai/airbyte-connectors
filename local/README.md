# Incrementally build a connector image

If you're making changes to a source or destination, and your changes do not
involve new or updated package dependencies, you can speed up your image
compilation time by using the latest connector image release as the base for
your new image.

## Steps

1. Run `docker pull farosai/airbyte-faros-destination:latest` to get the latest
   Faros Destination image release. This can be used as the base image for any
   source or destination.
2. Run the same `docker build` command that is used to normally build images,
   adding `-f local/Dockerfile`.

## Examples

Faros Destination:
```sh
docker build . -f local/Dockerfile --build-arg path=destinations/airbyte-faros-destination --build-arg version=0.0.1 -t airbyte-faros-destination
```

Example Source:
```sh
docker build . -f local/Dockerfile --build-arg path=sources/example-source --build-arg version=0.0.1 -t example-source
```
