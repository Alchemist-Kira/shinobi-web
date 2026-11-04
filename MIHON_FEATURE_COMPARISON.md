# Mihon / Tachiyomi vs. Shinobi (Web Edition) Feature Gap Analysis

This document provides a comprehensive technical comparison between the native **Mihon (Tachiyomi) Android application** and **Shinobi (Mihon Web Edition)**, detailing features present in the official mobile app that are currently missing, partially implemented, or adapted for the web environment.

---

## 1. Tracker Integration (Sync with Online Tracking Services)

### Native Mihon Feature:
- Native OAuth integration with tracking services:
  - **AniList**
  - **MyAnimeList (MAL)**
  - **Kitsu**
  - **MangaUpdates**
  - **Shikimori**
  - **Bangumi**
- Dedicated **Tracking** tab in manga details view showing tracking status, score, read chapter progress, and total chapters.
- **Auto-Sync on Read**: Reading a chapter in the reader automatically updates the read count on AniList / MyAnimeList in the background.

### Shinobi Web Status:
- **Missing**: No tracker OAuth flows, tracker account binding, or automatic reading status synchronization.

---

## ~~2. Automated Library Updates & Background Chapter Checking~~ `[COMPLETED]`

<del>

### Native Mihon Feature:
- **Background Worker for Library Updates**: Runs periodically (e.g., every 6 hours, 12 hours, daily) via Android WorkManager.
- Queries installed source extensions for new chapters across all library manga marked as favorites.
- System notifications indicating new chapters found (e.g., "5 new chapters available").
- **Smart Update Rules**:
  - Restrict updates to Wi-Fi only.
  - Skip manga with status "Completed".
  - Skip unread manga.
  - Automatic download of newly released chapters (e.g., download next 1, 2, or 3 unread chapters when discovered).

### Shinobi Web Status:
- **Implemented & Verified**: Full background scheduler running in daemon thread with configurable intervals (Off, 6h, 12h, Daily, 2 Days, Weekly), skip-completed toggle, automated downloading of newly released chapters, top action "Check Updates" button with animated status polling, and `+X NEW` chapter badges on manga library cards.

</del>

---

## ~~3. Batch Operations & Multi-Select Management~~ `[COMPLETED]`

<del>

### Native Mihon Feature:
- **Library Multi-Select**: Long-press on any manga card enters multi-select mode:
  - Batch category assignment / reassignment across multiple titles.
  - Batch mark as read or unread.
  - Batch download next N chapters.
  - Batch removal from library.
- **Chapter List Multi-Select**:
  - Range selection (select start chapter, hold shift/drag to select all intermediate chapters).
  - Batch download selected chapters.
  - Batch mark selected chapters as read, unread, or bookmarked.

### Shinobi Web Status:
- **Implemented & Verified**: Full library card multi-selection (Select button + long-press card trigger), floating glassmorphism batch actions bar, batch multi-category assignment modal, batch mark read/unread, batch auto-download next chapter, batch removal with disk file deletion option, and chapter list range selection (Shift + Click) with bulk download and progress actions.

</del>

---

## 4. Advanced Reader Engine Features

### Native Mihon Feature:
- **Spread Splitting & Dual-Page Handling**:
  - Automatically splits two-page scans into two single pages when reading in portrait or single-page mode.
  - Side-by-side dual-page view in landscape mode with "Shift first page" toggle for manga with cover pages.
- **Image Filters & Color Correction**:
  - Inverted colors (white-on-black color inversion for bright manga scans).
  - Grayscale conversion mode.
  - Color profile adjustments (contrast, brightness, custom color matrix).
- **Automatic Border Cropping**:
  - Detects and trims solid white/black margins around scan pages to maximize usable screen area.
- **Download Ahead (Buffer Ahead)**:
  - Automatically downloads the next 2-3 chapters into cache while reading the current chapter so transitions have zero latency.
- **Automatic Deletion After Reading**:
  - Setting to automatically delete downloaded CBZ/images after reading the chapter.
- **Custom Tap Zones & Navigation Binding**:
  - Customizable screen tap quadrants (e.g., 9-grid or 3-column navigation mappings).
  - Hardware button bindings (Volume Up / Down for page flipping).

### Shinobi Web Status:
- **Implemented in Web**: Continuous Webtoon strip, LTR, RTL, Single Page, Double Page, canvas width constraints, background color presets, chapter transitions, image proxying, prefetching, Inverted and Grayscale color filters, Auto-delete read chapter downloads, and automated Download Ahead while reading.
- **Missing in Web**: Border crop algorithms, spread splitting for two-page scans, and configurable tap-zone grids.

---

## <span style="opacity: 0.45;">5. Metadata Editing & Custom Covers [COMPLETED]</span>

<div style="opacity: 0.45;">

### Native Mihon Feature:
- **Custom Cover Upload**: Select any image from local storage or specify a custom URL to override the extension cover.
- **Custom Metadata Editor**:
  - Override title, author, artist, summary, and genre tags directly.
  - Revert overrides back to source metadata at any time.

### Shinobi Web Status:
- **Implemented in Web**: Dedicated "Edit Info" modal on manga details with live thumbnail preview, file upload and custom URL input, full field overrides (title, author, artist, status, genre tags, description), instant UI updating with purple "Customized" badge, and one-click "Reset to Source" reversion.

</div>

---

## <span style="opacity: 0.45;">6. Security, Privacy & Incognito Mode [COMPLETED]</span>

<div style="opacity: 0.45;">

### Native Mihon Feature:
- **App Lock**: Biometric fingerprint, PIN, or password authentication required on app launch or after configurable inactivity timeout (instant, 1m, 5m, 10m).
- **Incognito Mode**: Toggle from navigation drawer that temporarily suspends reading progress updates and history logging.
- **Secure Screen**: Prevents the operating system from taking screenshots or showing content previews in the task switcher.

### Shinobi Web Status:
- **Implemented in Web**: Top navigation incognito mode toggle with visual status indicator. Bypasses history logging and reading progress tracking both client-side and server-side. Includes Auto-delete read chapter downloads and reader color inversion/grayscale filters.

</div>

---

## <span style="opacity: 0.45;">7. Reading Statistics & Analytics [COMPLETED]</span>

<div style="opacity: 0.45;">

### Native Mihon Feature:
- Dedicated **Statistics** dashboard under More:
  - Total time spent reading (tracked in minutes/hours).
  - Total chapters read and total pages read.
  - Library breakdown charts by status (Ongoing, Completed, Dropped).
  - Library breakdown by source and by category.
  - Tracker synchronization status overview.

### Shinobi Web Status:
- **Implemented in Web**: Dedicated Statistics dashboard with summary KPI cards (Time Reading, Chapters Read, Pages Read, Library Total), 7-day reading activity bar chart, library status, sources and categories distribution progress bars, and ranked Most Read Manga cards.

</div>

---

## 8. Network & DNS Settings

### Native Mihon Feature:
- **Built-in DNS over HTTPS (DoH)**:
  - Direct selection of Cloudflare, Google, AdGuard, or Quad9 secure DNS to bypass ISP blocking without needing a system-wide VPN.
- **Custom User-Agent & HTTP Headers**:
  - Globally configurable User-Agent strings.
- **Extension Trust Verification**:
  - Cryptographic signature check and repo trust confirmation for third-party APK sources.

### Shinobi Web Status:
- **Partially Implemented**: Server handles CORS proxying, image referer headers, and user-agent spoofing for scrapers, but DNS resolution relies on host OS networking and does not provide an in-app DoH toggle.

---

## Summary Matrix

| Feature Domain | Native Mihon / Tachiyomi | Shinobi Web Edition | Implementation Feasibility in Web |
|---|---|---|---|
| **Official .tachibk Backup / Restore** | Yes | Yes (100% Protocol Buffer compatible) | Completed |
| **Keiyoushi / Extension Engine** | Yes | Yes (via integrated Suwayomi engine) | Completed |
| **Multi-Source Global Search** | Yes | Yes | Completed |
| **Local CBZ / Folder Library Support** | Yes | Yes | Completed |
| **Manga Migration Architecture** | Yes | Yes | Completed |
| **Webtoon / Strip Reader** | Yes | Yes | Completed |
| **Accent Theme Palettes** | Yes | Yes | Completed |
| **AniList / MAL Tracker Sync** | Yes | No | High (REST OAuth API) |
| **Background Library Auto-Update** | Yes | Yes (Daemon worker + auto-download + badges) | Completed |
| **Multi-Select Batch Operations** | Yes | Yes (Library batch bar + Chapter range selection) | Completed |
| **Auto-Delete Read Downloads** | Yes | Yes (Configurable toggle in Settings) | Completed |
| **Download-Ahead While Reading** | Yes | Yes (Configurable 1, 2, 3, or 5 chapters ahead) | Completed |
| **Incognito Reading Mode** | Yes | Yes (Header toggle + Reader indicator + Zero-log bypass) | Completed |
| **Reading Statistics Dashboard** | Yes | Yes (KPI cards + 7-day activity chart + Source/Status breakdown) | Completed |
| **Custom Covers & Metadata Editing** | Yes | Yes (Edit Info modal + Custom cover upload/URL + Reset) | Completed |
| **Page Spread Splitting & Border Crop** | Yes | No | Complex (Canvas image processing) |
| **App Lock / PIN Protection** | Yes | No | Medium (Web session password lock) |
| **Built-in DNS over HTTPS (DoH)** | Yes | No | Complex (Low level Python socket hooks) |
