# Faros Org Import Converter

The Faros Org Import converters allow ingesting organization data from any source so long as the records that are written conform to the specific form. The required forms are defined in the `types.ts` file.

## Employee Stream

This stream is responsible for writing employees, their various identities, and assigning them to teams.

## Team Stream

This stream is responsible for writing teams. It will check for issues with the data. It also associates team leads to their respective teams.

## Tool Stream

This stream is responsible for associating tools to employees.