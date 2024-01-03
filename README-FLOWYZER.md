# Development of Flowyzer Destination

1. Install [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating)
2. Install Node.js `nvm install 16 && nvm use 16`
3. Install [lerna](https://github.com/lerna/lerna) by running `npm install -g lerna`
4. Run `npm i` to install dependencies for all projects (`npm run clean` to clean all)
5. Run `npm run build -- --scope airbyte-faros-destination` to build 
6. Run `npm run test -- --scope airbyte-faros-destination` to test
7. Run `npm run lint -- --scope airbyte-faros-destination`to apply linter 

## Other Useful Commands

1. Audit fix `npm audit fix`
2. Clean your project `npm run clean`

## Build Docker Image
```sh
docker build . --build-arg path=destinations/airbyte-faros-destination --build-arg version=0.0.1 -t flowyzer/airbyte-faros-destination
```

And then run it:

```sh
docker run flowyzer/airbyte-faros-destination
```

## Use in AirByte Portal

Now you can import this as a new destination in AirByte. Use `flowyzer/airbyte-faros-destination` as the docker image name. 

## Related other docs

 - [Azure Repos Sorce](./sources/azure-repos-source/README.md)
 - [Azure WorkItems Sorce](./sources/azure-workitems-source/README.md)

## URLs
Airbyte	http://localhost:8000

Hasura	http://localhost:8080

Metabase http://localhost:3000 - default admin credentials are admin@admin.com/admin

n8n	http://localhost:5678