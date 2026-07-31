# LO2S Pattern Lab

LO2S Pattern Lab is an open-source, pixel-perfect LED screen test-pattern and Resolume pixel-map generator. It is designed for technical production workflows where physical dimensions, native pixel resolution, slice geometry, and export accuracy matter.

[Download the latest Windows release](https://github.com/johnjjdave/lo2s-pattern-lab/releases/latest)

## Highlights

- Metric wall calculator linking physical width, height, raster size, and pixel pitch
- Arithmetic expressions directly inside number fields
- Metric grid, cabinet IDs, color bars, grayscale, and native pixel-check patterns
- Configurable labels, guides, circles, safe area, center marker, and uploaded logos
- Resolume Advanced Output XML import with input-map and per-screen output-map rendering
- Automatic per-slice color palettes with global and selected-slice overrides
- Slice selection by click, multi-select, or drag marquee
- Pixel-accurate Fit Canvas and Actual 1:1 viewing, cursor-focused zoom, and panning
- Black or transparent PNG export, selected-slice export, and multi-screen output export
- Local project save/load and an offline Windows desktop build

## Windows release

Download the portable Windows build from [GitHub Releases](https://github.com/johnjjdave/lo2s-pattern-lab/releases).

Version 1.0.0 is an unsigned open-source release. Windows Defender SmartScreen may therefore show an “unknown publisher” warning. The project is preparing an application for free open-source signing through SignPath Foundation. You can verify a download using the SHA-256 checksum published with each release.

The desktop application runs locally and does not upload projects, Resolume XML files, logos, or exported images.

## Resolume workflow

1. Open **Resolume Pixel Map**.
2. Load a Resolume Arena Advanced Output XML preset.
3. Choose the input map or an output screen.
4. Adjust global settings, or select one or more slices for overrides.
5. Export the input map, selected slices, or all output screens as PNG files.

Checker blocks are calculated from the LED cabinet dimensions and pixel pitch. They are not arbitrary decorative grid sizes.

## Development

Requirements:

- Node.js 22.13 or newer
- npm
- Windows is required to package the Windows desktop executable

Install and run the hosted application locally:

```bash
npm install
npm run dev
```

Build and test the hosted application:

```bash
npm test
```

Build the Electron desktop application:

```bash
npm install
corepack enable
pnpm --dir desktop install --frozen-lockfile
npx vite build --config desktop/vite.config.ts
pnpm --dir desktop exec electron-builder --win portable --x64
```

## Privacy

The offline desktop application does not transfer information to networked systems. The hosted preview is delivered over the web but performs pattern generation and file processing locally in the browser.

## Licence and trademarks

The source code is released under the [MIT License](LICENSE). The bundled Geist and Geist Mono fonts are distributed under the [SIL Open Font License 1.1](public/brand/OFL.txt).

LO2S and the LO2S logo are trademarks of their respective owner. The open-source licence does not grant permission to represent modified versions as official LO2S releases.

See the [code-signing policy](CODE_SIGNING_POLICY.md) for release provenance and signing responsibilities.
