import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

async function initSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => file === 'sql-wasm.wasm' ? sqlWasmUrl : file
    })
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