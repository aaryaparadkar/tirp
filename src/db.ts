import pg from 'pg';

const { Pool } = pg;

export interface Database {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<T>>;
  /**
   * Run `fn` inside a transaction on a dedicated connection. Optional so
   * lightweight stubs (tests, tooling) do not need to implement it; callers
   * fall back to sequential execution when it is absent.
   */
  transaction?<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function queryOn(client: pg.PoolClient, text: string, values?: unknown[]) {
  return client.query(text, values);
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
    transaction: async <T>(fn: (tx: Database) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (text, values) => queryOn(client, text, values),
          transaction: () => {
            throw new Error('Nested transactions are not supported');
          },
          close: async () => undefined,
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
