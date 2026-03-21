const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL="([^"]+)"/);
if (!match) throw new Error("No URL");

const client = new Client({ connectionString: match[1] });
client.connect()
  .then(() => client.query("ALTER TABLE public.iso50001_baseline_model ADD COLUMN IF NOT EXISTS x_var varchar(10) DEFAULT 'rcn';"))
  .then(() => { console.log('success'); client.end(); })
  .catch(console.error);
