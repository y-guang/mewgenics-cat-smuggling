# Mewgenics Cat Smuggling – Agent Instructions

## Goal

A front-end only tool to help user transfer their cat in the game Mewgenics by editing the `sav` file.

---

## Tech Stack

- Frontend: ts + Vue 3 + pinia + Vite + tailwindcss + npm
- Database dependency: sqlite3 WASM for `sav` file binary parsing.

## Code Style Requirements

**General:**
- Modern syntax for the target language version
- No deprecated patterns
- Type-safe by default

## UI Principles

- Modern, grayscale, minimal.
- Prefer well-known, reputable UI/component libraries over hand-crafted low-level HTML elements. Use `@tanstack/vue-table` for data tables, etc. Do not manually design complex UI elements that a library handles well.
- Prefer progressive disclosure for multi-step or mutually exclusive flows: present the next decision only when prior context is known, then transition automatically instead of keeping stale options on screen.

## Resource

The reversed-engineered `sav` file editor is available at [mewgenics-savegame-editor](https://github.com/michael-trinity/mewgenics-savegame-editor). For local access, see `./external-resource/mewgenics-savegame-editor`.
