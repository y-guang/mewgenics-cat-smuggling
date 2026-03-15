import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

async function initSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node
      if (isNode) {
        const path = await import('node:path')
        const wasmPath = path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
        return initSqlJs({ locateFile: () => wasmPath })
      }

      const response = await fetch(sqlWasmUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch sql-wasm binary from ${sqlWasmUrl}: ${response.status}`)
      }

      const wasmBinary = await response.arrayBuffer()
      const header = new Uint8Array(wasmBinary, 0, Math.min(4, wasmBinary.byteLength))
      const isWasmMagic = header.length === 4
        && header[0] === 0x00
        && header[1] === 0x61
        && header[2] === 0x73
        && header[3] === 0x6D

      if (!isWasmMagic) {
        throw new Error(`Invalid sql-wasm payload fetched from ${sqlWasmUrl}; got non-wasm content`)
      }

      return initSqlJs({ wasmBinary })
    })()
  }
  return sqlPromise
}

export async function openDatabase(buffer: ArrayBuffer): Promise<Database> {
  const SQL = await initSql()
  return new SQL.Database(new Uint8Array(buffer))
}

export function exportDatabase(db: Database): Uint8Array {
  return db.export()
}

export function queryBlob(db: Database, sql: string, params: SqlValue[] = []): Uint8Array | null {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get()
  stmt.free()
  return row[0] instanceof Uint8Array ? row[0] : null
}

export function queryAllRows(db: Database, sql: string, params: SqlValue[] = []): SqlValue[][] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: SqlValue[][] = []
  while (stmt.step()) {
    rows.push(stmt.get())
  }
  stmt.free()
  return rows
}

export function sqlHexLiteral(data: Uint8Array): string {
  const hex = Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `X'${hex}'`
}