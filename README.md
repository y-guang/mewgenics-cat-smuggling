# Mewgenics Cat Smuggler / Mewgenics 喵喵发来！

Move a cat from one Mewgenics save to another without asking your friends to touch raw save data.

## TL;DR

1. Open the [website](https://y-guang.github.io/mewgenics-cat-smuggling/).
2. Generate a cat share picture from your save file.
3. Send or post that picture online.
4. Your friend drops the picture into `Import` and exports a new save with the cat added.

Chinese README: [README.zh-CN.md](README.zh-CN.md)

## Why This Exists

Mewgenics cats are too good to stay trapped in one save.

This project turns cat transfer into a friendlier flow:

- pick a cat
- generate a share image
- send it to a friend
- they drop it into the importer
- a new `.sav` file is generated with the cat added safely

The goal is simple: make cat sharing feel like a feature, not a modding chore.

## Highlights

- Frontend-first workflow built with Vue 3, Vite, and Pinia
- Import and export flows designed for normal players, not just reverse engineers
- PNG share image export with embedded full payload metadata for stronger recovery
- Blind-watermark fallback path for the short-key transfer flow
- English and Chinese UI support
- Windows save-path hints directly in the app for quick file access

## How Sharing Works

There are two ways to transfer a cat:

1. Share image
	The app exports a PNG share image. It embeds the full cat payload in PNG metadata, so import can recover the cat directly from the image when possible.

2. Short URL fallback
	The image also carries a short watermark key. If the PNG metadata is missing or damaged, the importer can still fall back to the short-link lookup flow.

There is also a long URL for archival use.

## Quick Start

### Requirements

- Node.js 20+
- npm

### Run the frontend

```bash
npm install
npm run dev
```

### Optional short-link backend

The frontend can run on its own, but short-link creation/lookup depends on the backend service.

Backend folder: [backend/README.md](backend/README.md)

## Player Flow

### Export a cat

1. Open your source `.sav` file.
2. Choose the cat you want to send.
3. Optionally upload a cover image for the share image.
4. Download the generated share PNG or copy the URLs.

### Import a cat

1. Drop the shared image into the importer, or open an import URL.
2. Choose the destination `.sav` file.
3. Adjust age/status if needed.
4. Export the updated save.

## Save Location on Windows

Typical path:

```text
%APPDATA%\Glaiel Games\Mewgenics\<Steam ID>\saves\
```

The app also shows this path in the upload screens so users can copy it directly.

## Share Service Configuration

Short URL backend base is configured in [src/config/share.ts](src/config/share.ts).

Environment variables:

- `VITE_SHORT_URL_API_BASE`
- `VITE_SHORT_URL_API_BASE_DEV`
- `VITE_SHORT_URL_API_BASE_PROD`

Resolution order:

1. `VITE_SHORT_URL_API_BASE`
2. Dev fallback: `VITE_SHORT_URL_API_BASE_DEV` or `http://127.0.0.1:8787`
3. Prod fallback: `VITE_SHORT_URL_API_BASE_PROD` or `https://mewgenics-cat-smuggling-api.yangguang.dev`

## Attribution

This project builds on the save-file design and reverse-engineering work from:

- [mewgenics-savegame-editor](https://github.com/michael-trinity/mewgenics-savegame-editor)

The blind watermark utility is adapted from:

- [blind_watermark](https://github.com/guofei9987/blind_watermark)

## Known Issue

- The new cat doesn't have its own family tree. But their children are fine.
- The death caused by aging it separately from the age configuration. Even if you set the age to 0, it will still die as the original cat's age increases. But I cannot find a field in the save file corresponding to the aging related health decrease.
