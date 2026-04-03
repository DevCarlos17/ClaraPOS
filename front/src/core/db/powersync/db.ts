import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'nexo21.db',
  },
})

export const getDb = () => db
