<div align="center">

<h1>
  <img src="docs/images/bookorbit-icon.png" alt="" width="128" height="128"><br>
  BookOrbit
</h1>

A self-hosted library and reading platform for ebooks, PDFs, audiobooks, and comics.

[![Latest release](https://img.shields.io/github/v/release/bookorbit/bookorbit?label=latest&style=flat-square)](https://github.com/bookorbit/bookorbit/releases)
[![Stars](https://img.shields.io/github/stars/bookorbit/bookorbit?style=flat-square&color=FFC72C)](https://github.com/bookorbit/bookorbit/stargazers)
[![GHCR Pulls](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fbookorbit%2Fbookorbit%2Fbookorbit&query=downloadCount&label=Docker%20Pulls&logo=docker&style=flat-square&color=2496ed)](https://github.com/bookorbit/bookorbit/pkgs/container/bookorbit)
[![CI](https://img.shields.io/github/actions/workflow/status/bookorbit/bookorbit/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/bookorbit/bookorbit/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/bookorbit/bookorbit/release.yml?style=flat-square&label=release)](https://github.com/bookorbit/bookorbit/actions/workflows/release.yml)
[![Coverage](https://img.shields.io/codecov/c/github/bookorbit/bookorbit?style=flat-square&flag=server&token=F6TADEFCUV&label=server%20coverage)](https://codecov.io/gh/bookorbit/bookorbit)

[![Website](https://img.shields.io/badge/Website-bookorbit.app-blue?style=flat-square&logo=googlechrome&logoColor=white&color=4169E1)](https://bookorbit.app)
[![Demo](https://img.shields.io/badge/Demo-live-brightgreen?style=flat-square&logo=rocket&logoColor=white&color=40a829)](https://demo.bookorbit.app/magic?token=2d92cb900e184cf0eb8b11f72cffc6011673d1016e1b300d750eb3d76abc1572)
[![App Store](https://img.shields.io/badge/App_Store-download-0D96F6?style=flat-square&logo=appstore&logoColor=white)](https://apps.apple.com/us/app/bookorbit-the-official-app/id6811807346)
![Android coming soon](https://img.shields.io/badge/Android-coming_soon-3DDC84?style=flat-square&logo=android&logoColor=white)
[![Crowdin](https://img.shields.io/badge/Crowdin-translate-2E3340?style=flat-square&logo=crowdin&logoColor=white)](https://crowdin.com/project/bookorbit)
[![Contributing](https://img.shields.io/badge/Contributing-guide-orange?style=flat-square&logo=handshake&logoColor=white)](https://github.com/bookorbit/bookorbit/blob/main/CONTRIBUTING.md)

![BookOrbit dashboard showing reading stats, widgets, and book shelves](docs/images/dashboard-overview.png)

<p align="center">
  <a href="#what-is-bookorbit">Overview</a> &bull;
  <a href="#live-demo">Live Demo</a> &bull;
  <a href="#bookorbit-for-iphone-and-apple-watch">iOS &amp; Apple Watch</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#quick-start-docker">Quick Start</a> &bull;
  <a href="#managed-hosting">Managed Hosting</a> &bull;
  <a href="#koreader-plugin">KOReader</a> &bull;
  <a href="#documentation-and-contributing">Docs</a>
</p>

</div>

---

<a id="what-is-bookorbit"></a>

## 📚 What is BookOrbit?

**[BookOrbit](https://bookorbit.app)** organizes your books and lets you enjoy them anywhere: on iPhone, Apple Watch, the web, Kobo, or KOReader. Your reading progress, highlights, and status stay synchronized, so you can start a chapter in one place and continue in another.

Around that core sit 14 metadata providers, reading statistics and achievements, OPDS and Send-to-Kindle delivery, multi-user accounts with OIDC/SSO, and automatic sync out to Hardcover, Readwise, and StoryGraph. All of it runs on infrastructure you control.

[![Visit Website](https://img.shields.io/badge/Visit%20Website-bookorbit.app-4169E1?style=for-the-badge&logo=googlechrome&logoColor=white)](https://bookorbit.app)

<a id="live-demo"></a>

## 🚀 Live Demo

Try the live instance before you install. No account required.

[![Launch Live Demo](https://img.shields.io/badge/Launch%20Live%20Demo-2ea44f?style=for-the-badge&logo=rocket&logoColor=white)](https://demo.bookorbit.app/magic?token=2d92cb900e184cf0eb8b11f72cffc6011673d1016e1b300d750eb3d76abc1572)

> **Note:** The demo includes a sample library of public domain books. Some administrative features are limited in the public demo. Self-hosting BookOrbit provides the full experience.

<a id="bookorbit-for-iphone-and-apple-watch"></a>

## 📱 BookOrbit for iPhone and Apple Watch

Take your library anywhere with the official native BookOrbit app. Read ebooks, PDFs, and comics; stream or download audiobooks; use text to speech; and keep reading offline. The app connects directly to your self-hosted BookOrbit server, while Apple Watch brings downloaded audiobooks and synchronized playback progress to your wrist.

![BookOrbit on iPhone showing the home screen, Read Along, and audiobook playback alongside the Apple Watch library](docs/images/ios-app-hero.webp)

<div align="center">

<a href="https://apps.apple.com/us/app/bookorbit-the-official-app/id6811807346"><img src="https://toolbox.marketingtools.apple.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download BookOrbit on the App Store" width="162" height="54"></a>
<img src="docs/images/android-coming-soon.svg" alt="BookOrbit for Android: coming soon" width="162" height="54">

<sub>Requires BookOrbit v3.0.0 or later and iOS 26 or later. Apple Watch features require watchOS 26 or later.</sub>

</div>

<details>
<summary><strong>Explore all 14 screenshots</strong></summary>

### iPhone

![Ten BookOrbit iPhone screens showing the home experience, Read Along, audiobook playback, book requests, appearance customization, text to speech, reading activity, achievements, shelves, and offline downloads](docs/images/ios-app-gallery.webp)

### Apple Watch

![Four BookOrbit Apple Watch screens showing the offline library, the app menu, audiobook playback, and playback settings](docs/images/apple-watch-showcase.webp)

</details>

<a id="features"></a>

## ✨ Features

### Reading Experience & Sync

- **Built-in Web Readers**: Ebooks (EPUB, KEPUB, MOBI, AZW3, AZW, FB2), PDFs, comics (CBZ, CBR, CB7), and audiobooks (M4B, MP3, M4A, OPUS, OGG, FLAC), with no extra plugins required.
- **Native iPhone & Apple Watch Apps**: Read, listen, download, upload, and synchronize with your BookOrbit server from a native, offline-capable iPhone app. Send audiobooks to Apple Watch for independent offline playback and later progress reconciliation.
- **Three-Way Sync (Kobo + KOReader + BookOrbit)**: Progress and annotations flow bidirectionally between Kobo devices, KOReader, and the BookOrbit web reader. Pick up on any surface where you left off on another, including highlights and deletions.
- **KOReader Plugin**: An on-device catalog browser with search, download, and status and rating management, alongside full progress and annotation sync.
- **Annotations & Highlights**: Highlights from the web reader, KOReader, and Kobo merge into one searchable hub. Filter by color, style, and source; export as Markdown, CSV, or JSON.
- **Hardcover, Readwise & StoryGraph Sync**: Push status, progress, reading dates, and ratings to Hardcover on configurable triggers; status and progress to The StoryGraph; and new highlights and notes to Readwise as you create them, from both the web reader and synced devices. Hardcover read history can be pulled back to backfill blank BookOrbit entries.
- **Statistics, Goals & Achievements**: Daily reading time, heatmaps, streaks, and library health, plus yearly goals, monthly challenges, and 50+ achievements across five categories. Reading DNA profiles your reading style from your actual session history.

### Library Management

- **Multiple Libraries**: Isolate content with per-library folders, custom scan rules, and format priorities.
- **12 Metadata Providers**: Google Books, Open Library, Amazon, Goodreads, Kobo, Hardcover, Audible, Audnexus, Libro.fm, and iTunes, plus ComicVine for comics and RanobeDB for light novels. [External providers](docs/METADATA_PROVIDERS.md) add more, such as Douban, FantLab, J-Novel Club, Libris, LubimyCzytac and MangaBaka. Cover art is sourced separately from iTunes, DuckDuckGo, and AudiobookCovers.
- **Smart Scopes & Collections**: Organize your collection with curated lists and dynamic, rule-based saved filters.

### Platform & Delivery

- **Multi-User & SSO**: Granular per-user permissions and isolated reading data, with native support for Authentik, Keycloak, and Authelia via OIDC.
- **Multilingual Interface**: Community translations are managed on [Crowdin](https://crowdin.com/project/bookorbit). See the [localization guide](docs/LOCALIZATION.md) for current language support and contributor instructions.
- **Content Delivery**: OPDS support for compatible apps, Send-to-Kindle via email, and browser drag-and-drop uploads.
- **Automated Ingestion**: Drop files into the Library Dock folder to review them before they reach a library. Each library can have its own dock, where incoming files get metadata and, with auto-file on, are named and filed into that library.

<a id="quick-start-docker"></a>

## 🐳 Quick Start (Docker)

```bash
mkdir bookorbit && cd bookorbit
mkdir -p books data/app data/postgres
curl -fsSLo .env https://raw.githubusercontent.com/bookorbit/bookorbit/main/.env.example
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/bookorbit/bookorbit/main/docker-compose.yml
```

Edit `.env` and set these required values:

```dotenv
APP_URL=http://your-server-ip:3000   # the URL you'll open in your browser
BOOKS_HOST_PATH=./books              # folder on your server where your book files live

POSTGRES_PASSWORD=         # database password           - openssl rand -hex 24
JWT_SECRET=                # signs login tokens          - openssl rand -hex 32
SETUP_BOOTSTRAP_TOKEN=     # one-time setup wizard token - openssl rand -hex 16
```

If your local book folder is owned by a user other than UID 1000, also set `PUID` and `PGID` to match that owner. Getting these wrong is the most common cause of permission errors on first scan.

Then start:

```bash
docker compose up -d
```

Open `http://your-server-ip:3000` and complete setup using your `SETUP_BOOTSTRAP_TOKEN`.

For the full installation guide including reverse proxy setup, host file permissions, secrets from mounted files, external databases, OIDC hardening, and environment variable reference, see **[bookorbit.app/installation](https://bookorbit.app/installation)**.

<a id="managed-hosting"></a>

## ☁️ Managed Hosting

Prefer a hosted instance without managing Docker or servers? [Zenith offers BookOrbit hosting](https://zenith.hosting/host/bookorbit) with a web file browser for uploads, access controls, and resource usage insights.

[![Deploy with Zenith](https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg)](https://zenith.hosting/host/bookorbit)

<a id="how-i-actually-use-bookorbit"></a>

## 📖 How I Actually Use BookOrbit

One read-along EPUB3 per book: listened to on iPhone, carried offline to Apple Watch for runs, read on a Kobo through KOReader, and picked up again on the laptop. One file, one reading position, no reconciling an audiobook against an ebook.

Read the full walkthrough at **[bookorbit.app/my-workflow](https://bookorbit.app/my-workflow)**.

<a id="koreader-plugin"></a>

## 🔄 KOReader Plugin

The BookOrbit plugin for KOReader adds progress sync, two-way annotation sync, and a native catalog browser: navigate, search, and download books from your library without leaving the device.

![BookOrbit KOReader Plugin on unbranded e-readers showing Home, book details, catalog browsing, dashboard customization, series, and navigation](docs/images/koreader-plugin-preview.webp)

1. In BookOrbit, go to **Settings > KOReader**, create credentials if prompted, and click **Download Plugin**.
2. Unzip `bookorbit.koplugin.zip`.
3. Copy `bookorbit.koplugin` to `koreader/plugins/` on the device.
4. Restart KOReader and open a book.
5. Use **Tools > BookOrbit Sync** to connect.

The download is pre-configured with your server URL and credentials, so there is no manual entry on the device. For full setup and sync options, see **[bookorbit.app/koreader-plugin](https://bookorbit.app/koreader-plugin)**.

<a id="documentation-and-contributing"></a>

## 🛠️ Documentation and Contributing

Full documentation lives at **[bookorbit.app](https://bookorbit.app/what-is-bookorbit)**: libraries, metadata, readers, Kobo sync, OPDS, users and permissions, OIDC and more.

**Guides**

- **Book requests**: indexers, download clients, path mappings, automation and the encryption key they need. See the [book requests guide](https://bookorbit.app/book-requests/).
- **AI providers**: connect OpenAI, Anthropic, Gemini, OpenRouter, a proxy or a local runner for AI features such as story guides, and the `AI_ENCRYPTION_KEY` that keeps provider keys encrypted. See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md).
- **Read-aloud**: optional STAlign generation and QuartzNet hardware acceleration. See [docs/READ_ALOUD.md](docs/READ_ALOUD.md).
- **API keys**: script and automation access with read-only, permission and library limits. See [docs/API_KEYS.md](docs/API_KEYS.md).
- **App attestation**: why a few features answer only the official iOS and Android apps, and what stays open to every client. See [docs/APP_ATTESTATION.md](docs/APP_ATTESTATION.md).
- **Jobs and bulk actions**: the Jobs page for long-running work, and bulk actions that keep running after the tab closes. See [docs/JOBS.md](docs/JOBS.md).
- **External metadata providers**: add a source that runs beside BookOrbit, such as FantLab or MangaBaka, with [docs/METADATA_PROVIDERS.md](docs/METADATA_PROVIDERS.md), or build your own with [docs/BUILDING_METADATA_PROVIDERS.md](docs/BUILDING_METADATA_PROVIDERS.md).

**Contributing**

- **Local development**: architecture, first-time setup, running, testing and conventions in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- **Contributing**: branch naming, test expectations, the PR checklist and commit format in [CONTRIBUTING.md](CONTRIBUTING.md).

<a id="support-bookorbit"></a>

## ❤️ Support BookOrbit

BookOrbit is built and maintained independently. Behind what appears to be a single product is a growing ecosystem: the core server and web application, Kobo and KOReader integrations, native iPhone and Apple Watch apps, and an Android app currently in development.

Each part requires its own engineering, testing, compatibility, release, and support work. Keeping the entire ecosystem moving at its current pace, without compromising quality, requires considerable time, focus, and energy. Support helps make that pace sustainable and creates more room for thoughtful development.

If BookOrbit is valuable to you and you would like to support its continued development, you can:

- [Get the official iPhone and Apple Watch app](https://apps.apple.com/us/app/bookorbit-the-official-app/id6811807346)
- [Support BookOrbit on Ko-fi](https://ko-fi.com/neonbookorbit)
- [Contribute through Open Collective](https://opencollective.com/bookorbit)
- [Star BookOrbit on GitHub](https://github.com/bookorbit/bookorbit)

Financial support is entirely optional. Using BookOrbit, recommending it to others, or starring the repository also makes a meaningful difference.

<a id="unsupported-storage-configurations"></a>

## ⚠️ Unsupported Storage Configurations

> [!WARNING]
> **NAS and network storage configurations are not supported.** BookOrbit requires a local filesystem with dependable semantics for every writable path, including book libraries, import folders, application data, and PostgreSQL data. Do not place these paths on SMB/CIFS, NFS, FUSE or cloud mounts, distributed filesystems, or similar storage, even when the storage is mounted as an ordinary directory.
>
> BookOrbit scans, moves, renames, and writes files while coordinating with its database and background jobs. Network and nonstandard filesystems can behave differently around atomic renames, locking, file notifications, permissions, caching, consistency, and durability. A configuration may appear to work and later cause intermittent failures, incomplete moves, stale library state, data loss, or corruption.
>
> Such configurations may work in a particular environment, but using them is entirely at your own risk. No support is provided for them. Please do not open GitHub issues for problems encountered with these configurations unless the problem can be reproduced using supported local storage.

<a id="repository-activity"></a>

## 📈 Repository Activity

![BookOrbit repository activity: commits, issues, and pull requests over the last 30 days](https://repobeats.axiom.co/api/embed/f572f532340ae02697af0a164e3839818071be2c.svg)

<a id="translations"></a>

## 🌐 Translations

Help translate BookOrbit into your language on [Crowdin](https://crowdin.com/project/bookorbit).

When adding user-facing text in code, add the Vue I18n key only to `client/src/locales/en.json`. Do not edit non-English catalogs in a feature pull request; untranslated keys fall back to English until Crowdin provides a translation. See [docs/LOCALIZATION.md](docs/LOCALIZATION.md) for the complete workflow.

[![Translation progress](https://raw.githubusercontent.com/bookorbit/bookorbit/generated-charts/translation-progress.svg)](https://crowdin.com/project/bookorbit)

<a id="star-history"></a>

## ⭐ Star History

[![BookOrbit GitHub star history](https://raw.githubusercontent.com/bookorbit/bookorbit/generated-charts/star-history.svg)](https://github.com/bookorbit/bookorbit/stargazers)

<a id="help-and-community"></a>

## 💬 Help and Community

- **Questions and help:** [Ask in GitHub Issues](https://github.com/bookorbit/bookorbit/issues/new?template=question.yml) or [browse help requests](https://github.com/bookorbit/bookorbit/issues?q=is%3Aissue%20label%3Asupport).
- **Community conversations:** [Start a conversation](https://github.com/bookorbit/bookorbit/issues/new?template=discussion.yml) or [browse community topics](https://github.com/bookorbit/bookorbit/issues?q=is%3Aissue%20label%3Adiscussion).
- **Bug reports:** [GitHub Issues](https://github.com/bookorbit/bookorbit/issues/new?template=bug_report.yml)
- **Feature requests:** [GitHub Issues](https://github.com/bookorbit/bookorbit/issues/new?template=feature_request.yml)
- **Security vulnerabilities:** Follow the private reporting process in the [Security Policy](.github/SECURITY.md).

Questions are welcome, even if you are unsure whether something is a bug. Share workflows, your setup, or companion apps in community conversations. See the [community guide](docs/COMMUNITY.md) for choosing a category and how topics are handled.

<a id="a-note-on-the-api"></a>
<a id="api-compatibility"></a>

## 🔌 API Compatibility

> [!IMPORTANT]
> BookOrbit's API evolves alongside its official clients. Backwards compatibility is maintained for released official apps, but the API is not currently a stable public integration surface, and compatibility with third-party clients is not guaranteed. For the most reliable experience, use the official apps, OPDS, Kobo sync, or the KOReader plugin.

<a id="credits"></a>

## 🙏 Credits

BookOrbit's read-aloud generation is built on the work of the [Storyteller](https://gitlab.com/storyteller-platform/storyteller) project. Its open-source libraries, `@storyteller/align` and `@storyteller/ghost-story`, align an ebook with its audiobook to produce the EPUB 3 read-along, and the QuartzNet alignment models come from Storyteller's model registry. Many thanks to the Storyteller team for their incredible work.

<a id="license-and-attribution"></a>

## ⚖️ License and Attribution

Copyright (C) 2025-2026 neon and BookOrbit contributors.

BookOrbit is licensed under the **[GNU Affero General Public License v3.0 only](LICENSE)**.

BookOrbit material whose copyright holders have authorized them is also subject to the **[BookOrbit Additional Terms](ADDITIONAL_TERMS.md)** under sections 7(b), 7(c), 7(d), and 7(e) of the GNU AGPL v3. See the **[Attribution and Legal Notice](NOTICE)** for the required attribution.

---

<a id="keepach-fork"></a>

## 🍴 About this fork (KeePach/bookorbit)

This is a personal fork of [bookorbit/bookorbit](https://github.com/bookorbit/bookorbit). Everything above this section is upstream's README. Everything in this section describes what the fork adds.

> [!WARNING]
> **The changes in this fork were vibecoded.** They were written with an AI coding assistant (Claude), directed and tested by the fork's owner on one home server. They were not reviewed by the BookOrbit maintainers and are not part of any official release.
>
> **Everything in this fork is provided "as is", without warranty of any kind, and no support is offered or expected.** Fork features may break, change or disappear at any time, including after an upstream update. Use them at your own risk and keep backups of your database and library. Issues and requests about fork features may go unanswered, and they must not be reported to the upstream BookOrbit project.

The fork does not publish Docker images or releases. To run it, build the image yourself from this repository (see [Setting up the fork](#keepach-fork-setup)). The upstream Quick Start above installs upstream BookOrbit, without any of these changes.

<a id="keepach-fork-features"></a>

### What the fork adds

> [!IMPORTANT]
> **The MangaBaka features need the modified MangaBaka provider** from [KeePach/bookorbit-mangabaka-modification](https://github.com/KeePach/bookorbit-mangabaka-modification) (`providers/mangabaka`), not the official one. The MangaBaka reading sync reads each book's chapter and volume from the ids that provider writes (`{id}v12`, `{id}vol3`, `{id}vol3v12`), so with another provider it has nothing to send. The licensing check matches series by those ids first and falls back to titles. Setup is in the YAML example below and in that provider's README.

**Manga and series**

- **Upcoming volumes.** Track the next volumes of a series from its page (date, store link, cover, note). Covers of tracked series get a colored frame and badge (out, today, soon, scheduled, no date, check due, up to date, complete). An **Upcoming** page in the sidebar and a dashboard shelf list everything you are waiting for, with a calendar feed (`.ics` link or download) and daily reminders through BookOrbit's notifications ("out today", "out soon", "time to check for a date"). The colors of every status can be changed at the bottom of the Upcoming page. Backups from the older userscript can be imported on a series page.
- **MangaBaka licensing check.** Pick your manga libraries on the Upcoming page. BookOrbit downloads MangaBaka's database dump, marks which series have an official English release (and by which publisher), and starts tracking the licensed ones. A per-series override fixes a wrong match.
- **MangaBaka reading sync.** Pushes the reading state of the series you choose to your own MangaBaka library, the same way BookOrbit syncs to Hardcover, but per series and without percentages:
  - Turn on **Sync to MangaBaka** on a series page. Your MangaBaka personal access token goes in the **MangaBaka reading sync** card on the Upcoming page.
  - The chapter and volume come from each book's MangaBaka id (`{id}v12` is chapter 12, `{id}vol3` is volume 3, `{id}vol3v12` is both), counting the books marked read.
  - The state follows your books: reading, rereading, paused (on hold), dropped (abandoned), plan to read. It becomes **completed** only when MangaBaka lists the series as completed and you have read its last listed chapter.
  - One way only. A chapter or volume number is never lowered on MangaBaka, and your rating, notes and lists there are never touched.
  - It runs a few seconds after a status change (web, KOReader or Kobo), on "Sync now", and once a day.
- **Convert comics with KCC.** "Convert with KCC" on a comic's page, or for a selection from the library page, runs [Kindle Comic Converter](https://github.com/ciromattia/kcc) in its own container. Saved option presets, a progress card, leaving out chosen pages (scanlator credits, for example), and either **Keep** (writes `Name_kcc.cbz` next to the original) or **Replace** (swaps the file, then renames it with the library's naming pattern). BookOrbit's metadata is written into the result's `ComicInfo.xml`, and a converted copy links to its book in KOReader without manual linking. Sources: CBZ, CBR, CB7 and PDF. Output: CBZ.

**Metadata**

- **External providers get more to work with.** BookOrbit sends the book's series name and index to external providers, and reads an optional `displayTitle` from their results. A provider can then match a file named with a romanized or native title against an English series without the match being dropped.
- **Tags field rule.** Provider tags merge as their own field, separately from genres, with a Tags row in the manual match dialog. Auto-fill and refresh pass tags through too.
- **Companion providers**, in [KeePach/bookorbit-mangabaka-modification](https://github.com/KeePach/bookorbit-mangabaka-modification):
  - **MangaBaka (modified):** reads chapter and volume numbers from file names, ranges, romanized titles, and tags a series that exists both as a comic and as a novel (`Solo Leveling (Manhwa)` and `Solo Leveling (Novel)`).
  - **BookWalker:** volumes, chapters and series from the English store at bookwalker.com.

**Calibre libraries**

- **Calibre custom columns fill BookOrbit custom fields.** A custom field whose key matches a Calibre column's lookup name (`collection` for `#collection`) is filled from each book's `metadata.opf`, kept up to date after scans, and usable in smart scopes. Calibre's value always wins.
- **Calibre subtitle column.** `#subtitle` fills BookOrbit's own Subtitle field (unless the field is locked).

**Kobo and KOReader**

- **Fanfic and web novel updates over Wi-Fi (KOReader plugin).** After a manual Sync now, the plugin checks the libraries you choose for updated files (for example fics FanFicFare updated in Calibre) and swaps them on the device in place. A finished fic with new chapters is reopened as reading, with the percentage rescaled to the longer text, and BookOrbit is told. Copies sent over USB from Calibre are linked to their BookOrbit book automatically, by Calibre uuid or by path.
- **Kepubify options for Kobo sync.** Custom CSS for every converted book, fullscreen reading fixes, a title page with the cover (automatic, always, never) and cover detection, under **Settings > Devices > Kobo**. The bundled kepubify is updated, and stretched SVG images in converted KEPUBs are fitted to the page.

<a id="keepach-fork-setup"></a>

### Setting up the fork

The examples keep upstream's `docker-compose.yml` as it is and put the fork's parts in a `docker-compose.override.yml` next to it. Docker Compose reads both files automatically.

**1. `.env`**: start from upstream's `.env.example` (see the Quick Start above), then change the image line so Compose tags the image it builds:

```dotenv
APP_IMAGE=bookorbit-fork:local
```

**2. `docker-compose.override.yml`**: build the app from the fork, and add the optional companion containers you want. Remove the services you don't need.

```yaml
services:
  app:
    # Build BookOrbit from the fork instead of pulling upstream's image.
    build:
      context: https://github.com/KeePach/bookorbit.git#main
    pull_policy: build
    environment:
      # Convert with KCC (only with the kcc service below).
      FORK_KCC_URL: http://kcc:8090
      # Optional fork settings, shown with their defaults:
      # FORK_KCC_WORK_DIR: /data/fork-kcc
      # FORK_KCC_TIMEOUT_SECONDS: "3600"
      # FORK_CALIBRE_COLUMNS_POLL_SECONDS: "60"        # 0 turns the Calibre column sync off
      # FORK_CALIBRE_COLUMN_LINKS: "kobo_shelf=#category, words=-"
      # FORK_CALIBRE_SUBTITLE_COLUMN: "#subtitle"      # "-" turns it off
      # FORK_MANGABAKA_SYNC_SWEEP_HOURS: "24"          # 0 turns the daily MangaBaka pass off
      # FORK_MANGABAKA_SYNC_DEBOUNCE_MS: "10000"
    # KCC writes into the comic folders (Name_kcc.cbz with Keep, the file itself with Replace),
    # so mount those library folders writable (no :ro).

  # Kindle Comic Converter, called only by BookOrbit over the compose network.
  kcc:
    container_name: bookorbit-kcc
    build:
      context: https://github.com/KeePach/bookorbit.git#main:docker/fork-kcc
      args:
        KCC_TAG: v13.0.4 # change and rebuild to update KCC
    restart: unless-stopped
    init: true
    user: "${PUID:-1000}:${PGID:-1000}"
    expose:
      - "8090"
    volumes:
      # The same folder BookOrbit sees as /data/fork-kcc.
      - ./data/app/fork-kcc:/work
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true

  # Modified MangaBaka metadata provider, needed by the MangaBaka features.
  # In BookOrbit: http://mangabaka:8080
  mangabaka:
    container_name: bookorbit-mangabaka
    build:
      context: https://github.com/KeePach/bookorbit-mangabaka-modification.git#main:providers/mangabaka
      dockerfile: Dockerfile
    image: mangabaka-provider:local
    restart: unless-stopped
    ports:
      - "127.0.0.1:8081:8080"
    environment:
      PUBLIC_URL: http://localhost:8081 # lets BookOrbit link each MangaBaka id

  # BookWalker metadata provider. In BookOrbit: http://bookwalker:8080
  bookwalker:
    container_name: bookorbit-bookwalker
    build:
      context: https://github.com/KeePach/bookorbit-mangabaka-modification.git#main:providers/bookwalker
      dockerfile: Dockerfile
    image: bookwalker-provider:local
    restart: unless-stopped
    ports:
      - "127.0.0.1:8082:8080"
    environment:
      PUBLIC_URL: http://localhost:8082 # lets BookOrbit link each BookWalker id
    volumes:
      - ./data/bookwalker:/data
```

**3. Build and start:**

```bash
docker compose up -d --build
```

Builds from a Git URL are cached. After the fork changes, rebuild without the cache:

```bash
docker compose build --no-cache app kcc mangabaka bookwalker
docker compose up -d
```

If you build from a local clone instead, use `build: { context: /path/to/bookorbit }` for `app` and `build: /path/to/bookorbit/docker/fork-kcc` for `kcc`, check out `main` and keep the working copy clean before building, and refresh the browser with Ctrl+F5 after a rebuild.

**4. Per feature, inside BookOrbit:**

| Feature                   | Where to set it up                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upcoming volumes          | On a series page, **Track upcoming volumes** (then **Add volume**). Everything gathers on **Upcoming** in the sidebar. **Copy calendar link** there gives a feed for your calendar app.                                                                                                                                                          |
| MangaBaka licensing       | **Upcoming** page, **MangaBaka licensing** card: tick your manga libraries, **Save libraries**, **Check licensing now**.                                                                                                                                                                                                                         |
| MangaBaka reading sync    | Create a personal access token on mangabaka.org (account settings, API and apps, Personal access tokens) and paste it in the **MangaBaka reading sync** card on the Upcoming page. Then turn on **Sync to MangaBaka** on each series page. The books need MangaBaka ids, so fetch their metadata from the **modified** MangaBaka provider first. |
| KCC                       | **Settings > Devices > KCC** shows whether BookOrbit reaches the container and holds the presets. For **Keep**, add `*_kcc.cbz` to the library's **Skip files matching** list (**Settings > Libraries**). **Replace** is offered only where the library has both **Write to file** and **Rename files** on.                                      |
| External providers        | **Settings > Metadata > Providers**, external providers: add `http://mangabaka:8080` and `http://bookwalker:8080`, then press **Test**.                                                                                                                                                                                                          |
| Tags                      | **Settings > Metadata > Field Rules**: set a rule for **Tags**.                                                                                                                                                                                                                                                                                  |
| Calibre custom columns    | Point a library at a Calibre library folder (one book per folder, with `metadata.opf`). In **Settings > Metadata > Custom Fields**, create a field whose label is the column's lookup name without `#` (`collection` for `#collection`), then rename the label freely. Overrides go in `FORK_CALIBRE_COLUMN_LINKS`.                              |
| Fanfic updates (KOReader) | Install the plugin with **Download Plugin** in **Settings > Devices > KOReader** (the fork's plugin files are included). On the device: top menu, **Tools > BookOrbit > Fanfic updates > Libraries to keep updated**. Updates are checked after a manual **Sync now**.                                                                           |
| Kepubify options          | **Settings > Devices > Kobo**. Changing them regenerates the cached KEPUBs.                                                                                                                                                                                                                                                                      |

To check that a feature runs, the app logs use tags you can filter on, for example:

```bash
docker logs bookorbit-app 2>&1 | grep -E "mangabaka_sync|calibre_columns|ForkSchema"
```

<a id="keepach-fork-notes"></a>

### Notes for keeping the fork in step with upstream

- Fork code lives in its own folders where possible (`server/src/fork/`, `server/src/modules/series-release/`, `client/src/features/series-releases/`, `client/src/features/fork-kcc/`, `docker/fork-kcc/`, the `bookorbit_fork*.lua` files of the KOReader plugin), so upstream merges touch few files.
- The fork owns no database migrations. Its tables and columns are created when the app starts, with `IF NOT EXISTS` statements, and upstream's migrations folder stays exactly as upstream ships it.
- Upstream is only ever fetched from. Nothing from this fork is sent upstream as a pull request.
