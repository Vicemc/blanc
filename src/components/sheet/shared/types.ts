export type SheetSubject =
  | { kind: 'tamer';    id: string }
  | { kind: 'pair';     tamerId: string; digimonId: string; stage?: number }
  | { kind: 'wild' | 'digimon'; id: string }
  | { kind: 'bug';      id: string }
  | { kind: 'sign';     id: string }
  | { kind: 'survivor'; id: string }

export interface TokenSpawn {
  name:  string
  level: string
  qty:   number
}

export type StatEntry =
  | [string, string | number]
  | [string, string | number, (v: number) => void]
