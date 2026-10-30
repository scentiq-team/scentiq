import { createDatabase } from '../client.js';
import { countSampleRows } from '../sample-data-gate.js';
import { fail, loadConfigOrExit, runTool } from './context.js';

// Deployment gate: exits with an error if the database it points at holds sample data.
runTool(async () => {
  const config = loadConfigOrExit();
  if (config.databaseUrl === undefined) fail('DATABASE_URL is required.');
  const database = createDatabase({
    url: config.databaseUrl,
    poolMax: 1,
    applicationName: 'scentiq-sample-gate',
  });
  try {
    const rows = await countSampleRows(database.db);
    if (rows > 0) fail(`Found ${rows} sample data row(s). Production must contain none.`);
    console.log('No sample data found.');
  } finally {
    await database.close();
  }
});
