# Shinobi Web

Modern, client-first manga and manhwa web reader inspired by Mihon (Tachiyomi). Built for zero-server static hosting on Vercel or local execution.

---

## Key Features

- **Client-Side & Serverless Architecture**:
  - Runs 100% client-side using browser IndexedDB and the W3C File System Access API.
  - Deployable on Vercel with zero database dependencies.
  - Edge proxy and scraper functions for MangaDex, Asura Scans, and MangaPill.

- **Custom Drive Storage (Mihon Directory Layout)**:
  - Connect any folder on any drive (e.g. `E:\Shinobi`) using the File System Access API.
  - Preserves system `C:\` drive space by storing chapters and library data externally.
  - Standard Mihon folder hierarchy:
    - `downloads/`: Chapter CBZ packages
    - `backups/`: JSON backup files
    - `local/`: Local manga folders scanned into the library
    - Root JSON records: `library.json`, `progress.json`, `categories.json`, `settings.json`

- **First-Visit Onboarding Wizard**:
  - Interactive setup wizard for storage location, theme accent color, and reader mechanics.
  - Detects existing drive saves and imports reading progress automatically across browsers.

- **Reading Mechanics**:
  - **Webtoon Mode**: Continuous vertical strip reader designed for webtoons and manhwa.
  - **Paged Mode**: Single-page viewer with tap and keyboard navigation.
  - **Customizable Layout**: Adjustable reading widths (650px, 800px, 1000px, 1200px, Full Width) and canvas themes (Pitch Black, Dark Slate, Warm Paper).

- **Catalog & Extension Management**:
  - Integrated sources: MangaDex, Asura Scans, MangaPill.
  - External repository support (Keiyoushi and custom repositories).
  - Install and uninstall sources on demand with zero bloat out of the box.

---

## Deployment to Vercel

1. Push this repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Vercel automatically detects `vercel.json` and `package.json`.
4. Click **Deploy**.

---

## Local Development & Execution

To run locally with the optional Python backend engine:

```bash
python run.py
```

Then open [http://localhost:8787](http://localhost:8787) in your browser.
