import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(dir + 'relevamiento.db');
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS procesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    creado TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proceso_id INTEGER NOT NULL REFERENCES procesos(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    orden INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS checklist (
    clave TEXT PRIMARY KEY,
    hecho INTEGER NOT NULL DEFAULT 0,
    nota TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS respuestas_guia_proceso (
    clave TEXT NOT NULL,
    proceso_id INTEGER NOT NULL REFERENCES procesos(id) ON DELETE CASCADE,
    hecho INTEGER NOT NULL DEFAULT 0,
    nota TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (clave, proceso_id)
  );
`);
