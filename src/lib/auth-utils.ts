const LEVEL_NAMES: Record<number, string> = {
  1: 'Propietario',
  2: 'Supervisor',
  3: 'Cajero',
}

export function getLevelName(level: number): string {
  return LEVEL_NAMES[level] ?? 'Cajero'
}

export function isOwner(level: number): boolean {
  return level === 1
}

export function isManagement(level: number): boolean {
  return level <= 2
}
