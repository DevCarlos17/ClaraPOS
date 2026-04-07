import { PowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'clarapos.db',
  },
})

export const getDb = () => db
