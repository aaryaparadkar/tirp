import pg from 'pg';

const { Pool } = pg;

export interface Database {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<T>>;
  close(): Promise<void>;
}

export function createDatabase(connectionString = process.env.DATABASE_URL): Database {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_SIZE || 10),
    ssl: process.env.DATABASE_SSL === 'false' ? false : undefined,
  });
  return {
    query: (text, values) => pool.query(text, values),
    close: () => pool.end(),
  };
}
