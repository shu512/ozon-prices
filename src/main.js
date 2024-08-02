require('dotenv').config()

const { runSearch } = require('./searcher');
const { getActualIds, splitArray } = require('./utils');
const { getNotExistedProducts } = require('./utils/db');
const { logStarted, logFinished } = require('./utils/log');
const { validateEnv } = require('./utils/validate_env');

async function main() {
  const input = {
    from    : 806075000,
    to      : 806120000,
    threads : 8,
  };

  validateEnv();

  const startDate = logStarted(input);

  const idsToSkip = await getNotExistedProducts(input.from, input.to);
  const ids = splitArray(getActualIds(input, idsToSkip), input.threads);
  await Promise.all(
    ids.map(idsChuck => runSearch(idsChuck))
  );

  logFinished(input, startDate);

}

main();

