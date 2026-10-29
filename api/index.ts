// Vercel Function entry. Every /api/* request is rewritten here (see vercel.json).
import { neonSql } from '../server/db.js';
import { readEnv } from '../server/env.js';
import { createHandler } from '../server/routes.js';

const env = readEnv();
const handle = createHandler(env, env ? neonSql(env.databaseUrl) : null);

export default { fetch: handle };
