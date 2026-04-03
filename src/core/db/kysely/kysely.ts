import { wrapPowerSyncWithKysely } from '@powersync/kysely-driver'
import { db as powerSyncDb } from '../powersync/db'
import type { DB } from './types'

export const kysely = wrapPowerSyncWithKysely<DB>(powerSyncDb)

export type { DB } from './types'
export { powerSyncDb as db }
