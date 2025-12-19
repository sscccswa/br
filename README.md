# Breach Explorer

Desktop application for loading, indexing, and exploring large data files. Built with Electron, React, and TypeScript.

## Features

- Load and index files up to 15GB+
- Support for CSV (comma, semicolon, tab, pipe delimiters - auto-detected)
- Support for JSON (NDJSON and traditional JSON arrays)
- Support for VCF (vCard contacts)
- Fast indexed search across multiple fields
- Browse mode with paginated table view
- Search mode with field-specific filters
- Record detail view
- Multi-tab interface
- Persistent indexes for instant re-opening

## Installation

### From Release

Download the latest installer from the [Releases](https://github.com/sscccswa/br/releases) page.

### From Source

```bash
git clone https://github.com/sscccswa/br.git
cd br
npm install
npm run build
npm run dist
```

The installer will be generated in the `release` folder.

## Development

```bash
# Install dependencies
npm install

# Start development servers (Vite + Electron)
npm run dev

# In another terminal, start Electron
npm run electron:dev
```

## Usage

1. Drag and drop a file or use the file picker
2. Wait for indexing to complete (progress shown in real-time)
3. Browse data in table mode or search in search mode
4. Click any row to view full record details

### Supported Formats

**CSV**
- Comma-separated (`,`)
- Semicolon-separated (`;`)
- Tab-separated (`\t`)
- Pipe-separated (`|`)

Delimiter is auto-detected from the first line.

**JSON**
- NDJSON (one JSON object per line)
- JSON arrays (`[{...}, {...}, ...]`)

Format is auto-detected based on file content.

**VCF (vCard)**
- Standard vCard 3.0/4.0 format
- Extracted fields: FN, N, EMAIL, TEL, ORG, ADR, NOTE, URL, BDAY, TITLE
- Multiple emails/phones per contact supported
- Line folding (multi-line values) handled automatically

## Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts    # Window management
│   ├── ipc-handlers.ts
│   ├── indexer.ts  # Indexing coordinator
│   ├── indexer-worker.ts  # Worker thread
│   └── file-reader.ts     # Indexed file access
├── preload/        # IPC bridge
├── renderer/       # React frontend
│   ├── components/
│   ├── stores/
│   └── hooks/
└── shared/         # Shared types
```

## Index Storage

Indexes are stored in `%APPDATA%/breach-explorer/indexes/` with the following files per indexed source:

- `{id}.index.bin` - Binary position index (6 bytes per record)
- `{id}.search.txt` - Searchable text index
- `{id}.meta.json` - Metadata (columns, format, delimiter)
- `{id}.stats.json` - Column statistics

## Tech Stack

- Electron 28
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- TanStack Table (virtualized table)
- Framer Motion (animations)
- Recharts (charts)

## License

MIT
