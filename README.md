<p align="center">
  <img src="public/brand/lo2s-pattern-lab-icon.png" width="180" alt="LO2S Pattern Lab icon">
</p>

# LO2S - Pattern Lab

LO2S Pattern Lab is an open-source LED test-pattern, Resolume pixel-map, and 3D WYSIWYG simulation workspace. It is designed for technical production workflows.

**Current release: LO2S Pattern Lab v1.2.0 Beta**

[Open the web app](https://patternlab.lo2s.com/) · [Download the Windows portable app](https://github.com/johnjjdave/lo2s-pattern-lab/releases/tag/v1.2.0-beta)

[Read the complete v1.0.1 → v1.2.0 Beta changelog](CHANGELOG.md)

## What is included

### Test Patterns

- Linked physical-size, raster-resolution, pixel-pitch, and cabinet calculations
- Arithmetic expressions inside supported numeric fields
- Metric grid, cabinet IDs, color bars, grayscale, and native pixel-check patterns
- Configurable labels, guides, circles, safe area, center marker, and uploaded logos
- Pixel-accurate Fit Canvas and Actual 1:1 viewing with cursor-focused zoom and panning
- Black or transparent PNG export with remembered save locations in the desktop app

### Resolume Pixel Map

- Resolume Advanced Output XML import
- Composition input-map and per-screen output-map rendering
- Automatic per-slice color palettes with global and selected-slice overrides
- Click, multi-select, and drag-marquee slice selection
- Per-slice information, physical dimensions, and output-map diagnostics
- Selected-slice and multi-screen PNG export
- Optional linked XML workflow in the Windows app for automatic map refresh

### 3D Simulation — Beta

- Every Resolume XML slice becomes a separately selectable, physically scaled LED screen
- Pixel-map-accurate cropped UV mapping across the full composition
- Emissive LED materials that preserve the source color and brightness
- Move and rotate gizmos with local/world axes and arithmetic-enabled transform fields
- Bottom-left, bottom-centre, or bottom-right pivots globally or per slice
- Horizontal and vertical screen curvature with smooth curved extrusion
- Configurable extrusion depth, floor, metre grid, and scene background brightness
- Multi-selection, undo/redo, saved camera state, and beta project save/load
- GLB, glTF package, OBJ package, and MVR 1.5 scene export with geometry, UVs, names, and transforms

## Live video sources

The Windows desktop beta supports:

- Pattern Generator at native quality
- Video Devices such as webcams and capture devices
- NDI source discovery and reception
- Spout sender discovery and reception
- Low Latency and High Quality modes
- Global source routing with per-slice overrides

NDI and Spout require the Windows desktop application and its native source bridge. They are not available in the hosted browser version. Higher-resolution live feeds can increase GPU, decoding, and network load depending on the source resolution and number of active feeds.

## Windows release

Download `LO2S-Pattern-Lab-3D-Beta-1.2.0-beta-Portable.exe` from the [v1.2.0 Beta release](https://github.com/johnjjdave/lo2s-pattern-lab/releases/tag/v1.2.0-beta). The portable build does not require installation and uses a separate beta application identity.

SHA-256:

```text
8A7CC3E24951EAC3881E04B4214842A163B0824B154EEBBB20F270BA154591B3
```

This is an unsigned open-source beta. Windows Defender SmartScreen may show an “unknown publisher” warning. Verify the executable using the checksum above or the digest shown on GitHub Releases.

The desktop application processes projects, Resolume XML files, logos, source frames, and exports locally. It does not upload project content to LO2S servers.

## Recommended Resolume workflow

1. Configure the composition and slices in Resolume Advanced Output.
2. Open **Resolume Pixel Map** in Pattern Lab and import the XML preset.
3. Confirm the composition, physical scale, slice sizes, and pixel-map output.
4. Open **3D Simulation** and arrange the slices to match the physical LED setup.
5. Select Pattern Generator, Video Devices, NDI, or Spout as the global source.
6. Apply per-slice source overrides only where needed.
7. Save the beta project and export the required 3D scene format.

Checker blocks are calculated from LED cabinet dimensions and pixel pitch; they are not arbitrary decorative grid sizes.

## Beta notes

- The web app provides the full browser-compatible Pattern Lab interface, including 3D layout and pattern simulation.
- NDI and Spout are Windows desktop features because browsers cannot directly access those native protocols.
- MVR export targets version 1.5 for broader compatibility with current lighting and visualization software.
- Live-input performance depends on source resolution, codec, network conditions, GPU, and scene complexity.
- Report reproducible problems through [GitHub Issues](https://github.com/johnjjdave/lo2s-pattern-lab/issues).

## Development

Requirements:

- Node.js 22.13 or newer
- Corepack with pnpm
- Windows and Visual Studio C++ build tools when rebuilding the native NDI/Spout source bridge

Install dependencies and build the web application:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec vite build --config desktop/vite.config.ts
```

Run the project tests:

```bash
pnpm test
```

Package the Windows desktop application:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm exec vite build --config desktop/vite.config.ts
pnpm --dir desktop exec electron-builder --win portable --x64
```

## Licence and trademarks

The source code is released under the [MIT License](LICENSE). Bundled fonts are distributed under the [SIL Open Font License 1.1](public/brand/OFL.txt).

LO2S and the LO2S logo are trademarks of their respective owner. The open-source licence does not grant permission to represent modified versions as official LO2S releases.

See the [code-signing policy](CODE_SIGNING_POLICY.md) for release provenance and signing responsibilities.
