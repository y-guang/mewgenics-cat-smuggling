# Mewgenics Cat Smuggling

A lightweight frontend tool for transferring cats in Mewgenics by editing the game's `.sav` file.

## Attribution

This project follows the save-file design and reverse-engineering approach from
[mewgenics-savegame-editor](https://github.com/michael-trinity/mewgenics-savegame-editor).

The blind watermark utility is adapted from
[blind_watermark](https://github.com/guofei9987/blind_watermark), a DWT-DCT-SVD
blind watermarking implementation.

This repository currently focuses on the UI and integration layer.

## Status

Early stage. More features may be added later.

## Frontend Share Config

Short URL backend base is configured in `src/config/share.ts`.

- Override for all environments: `VITE_SHORT_URL_API_BASE`
- Dev override: `VITE_SHORT_URL_API_BASE_DEV`
- Prod override: `VITE_SHORT_URL_API_BASE_PROD`

Resolution order:

1. `VITE_SHORT_URL_API_BASE`
2. If dev mode: `VITE_SHORT_URL_API_BASE_DEV` (fallback `http://127.0.0.1:8787`)
3. If production mode: `VITE_SHORT_URL_API_BASE_PROD` (fallback `https://example.com`)

See `.env.example`.
