# Building and checking TitleDeck

[← Home](../README.md) · [Source](../SOURCE.md) · [Source hashes](RELEASE_SOURCE_SHA256_1.4.0.md) · [Hardware checklist](RELEASE_TESTING_1.4.0.md)

## Tools and commands
The runtime is a self-contained JavaScript module paired with a Python Decky backend. Install Node 22+ and Python 3.12+ for development.

```bash
npm ci
npm run build
node --check src/index.js
python3 -m py_compile main.py
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

`npm run build` synchronizes the manifests with `package.json`, bundles the Markdown renderer and its locked dependencies with esbuild, and checks the generated module. `npm run version:check` verifies that the checked-in runtime matches the build. `npm run release:zip` builds fresh versioned **Rebuilt** and **Repository-Source** ZIPs after tests, but neither may be substituted for the exact original hardware-accepted installer without repeating Steam Deck acceptance.

## Current source layout
- `main.py`: Decky backend, stored preferences, theme read-only coordination.
- `src/index.js`: frontend source.
- `src/description-markdown.js`: the Markdown renderer and link navigation.
- `dist/index.js`: the generated frontend installed by Decky, including the dependencies and their license notices.
- `assets/`: icon, Quick Access icon and Typography Studio art.
- `tests/`: current checks plus archived historical tests.
- `docs/screenshots/v1.4.0/`: all 22 nonduplicated image captures.
- `docs/RELEASE_SOURCE_SHA256_1.4.0.md`: hashes produced from the original official ZIP.

## Published 1.4.0 installer
The expected SHA-256 is `bf1b6108d0861246337915011fd1348ec51475dd042ae1d62c3226777266b588`. The original upload was checked for file integrity, 13/13 installer/source parity, and version consistency. The maintainer's hands-on testing is described separately from automated verification.

## Theme boundaries
When Art Hero is active, TitleDeck reads and displays its position and does not write to the CSS Loader theme. The user must edit Carousel Font Height in CSS Loader. Use the [Art Hero compatibility guide](ART_HERO_COMPATIBILITY.md).

## Historical source
The [older 1.2.2 material](../SOURCE.md) and previous release notes remain available. Tests relying on the 1.2.2 source were archived, not removed.
