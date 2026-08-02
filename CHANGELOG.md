# Changelog

All notable user-facing changes to LO2S Pattern Lab are documented here. Each release records new features, improvements, bug fixes, compatibility notes, and known limitations relative to the previous published version.

## [1.2.0 Beta] - 2026-08-02

This is the first public beta of the 3D Simulation workspace and the main public download after v1.0.1. The Windows portable build retains a separate beta application identity so it does not replace the installed stable application.

### New features

#### 3D Simulation workspace

- Added a dedicated **3D Simulation** workspace alongside Test Patterns and Resolume Pixel Map.
- Converts every imported Resolume Advanced Output XML slice into an independently selectable 3D LED screen.
- Builds screens at their calculated physical width and height while locking scale to the XML raster and physical pixel-pitch data.
- Places screens from their XML input-map coordinates on initial load and preserves saved world transforms when slice dimensions change.
- Maps the full composition texture across all screens with cropped, clamped UVs for pixel-map-accurate WYSIWYG playback; textures do not tile or repeat.
- Uses unlit, emissive-style LED faces so source colors and brightness are not altered by scene lighting, distance, or material falloff.
- Adds configurable screen extrusion from 1–50 cm, with a 10 cm default, direct value entry, slider control, and reset.
- Adds independent horizontal and vertical curvature from -180° to +180°, direct value entry, sliders, reset controls, smooth subdivisions, and curved extrusion.
- Adds independently controlled floor visibility, one-metre grid visibility, and scene background brightness.
- Uses a fixed 2,000 × 2,000 metre world-space floor and one-metre grid rather than a camera-following visual plane.

#### Scene editing and navigation

- Added move and rotate gizmos with switchable local and world axes.
- Added bottom-left, bottom-centre, and bottom-right pivots, configurable globally or per selected slice.
- Added exact world-position and rotation fields with arithmetic-expression support.
- Transform readouts update live while dragging, accept mouse-wheel changes when hovered, and display cleaned practical decimal values.
- Added click selection, Ctrl/Shift-click multi-selection, and Ctrl-drag marquee selection of visible screens.
- Multi-slice numeric edits apply the entered value to each selected screen instead of treating the selection only as a temporary group offset.
- Added up to 100 steps of undo and redo, including Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y shortcuts.
- Added orbit, right-drag view panning, cursor-centred wheel zoom, Fit Scene, saved camera state, desktop fullscreen, and Escape-to-exit fullscreen.

#### Sources and routing

- Added Pattern Generator, Video Devices, NDI, and Spout as 3D texture sources.
- Added one global source with optional per-slice source overrides.
- Added dedicated source discovery, selection, connection, reconnection, refresh, and disconnect controls for NDI and Spout.
- Added dedicated device selection for webcams and capture devices instead of presenting them as NDI or Spout sources.
- Added **Low Latency** and **High Quality** live-input modes while keeping Pattern Generator at native full quality.
- Added a native Windows source bridge for NDI and Spout reception; browser builds continue to provide browser-compatible sources only.
- Automatically disconnects and reinitializes native inputs when the feed, sender, or quality mode changes.

#### Project and export workflow

- Added beta project save/load for transforms, pivots, source routing, source quality, depth, curvature, axis mode, floor, grid, background, and camera state.
- Added GLB export with embedded texture, named screen nodes, UVs, physical scale, and transforms.
- Added glTF package export as a ZIP containing the scene and supporting assets.
- Added OBJ package export as a complete world-positioned scene with UV mapping and baked transforms.
- Added MVR 1.5 export with a single embedded uncompressed GLB scene resource for broader visualizer compatibility.
- GLB and glTF exports intentionally avoid Draco compression to support importers that do not ship a Draco decoder.
- Remembers the last desktop save location separately for PNG and 3D scene exports.

### Interface and workflow improvements

- Expanded the application navigation and side panels for the new simulation, source-routing, geometry, transform, appearance, export, and project controls.
- Standardized the interface on the Geist typeface for clearer small text and removed Geist Mono from compact controls.
- Simplified live-source quality labels to **Low Latency** and **High Quality** and corrected source-panel spacing and alignment.
- Made numeric spinner controls transparent so only their arrows remain visible.
- Removed the redundant 3D status strip and duplicate informational/history panels from the visible simulation layout, allowing the live viewer to use the recovered space.
- Added clearer selection counts, physical screen dimensions, locked-scale status, saved-state feedback, and local-only beta messaging.
- Kept the existing Test Patterns and Resolume Pixel Map workflows available in the same interface.

### Bug fixes since v1.0.1

#### 3D rendering and camera

- Fixed screen colors fading or shifting when the camera zoomed away from the scene.
- Fixed close-up black combing, z-fighting, and extrusion artifacts on thin or curved screens.
- Fixed distant screen and floor clipping by making camera depth handling adapt to the viewed scene.
- Fixed right-drag panning moving the apparent world, floor, or screen arrangement instead of only moving the camera view.
- Fixed the floor/grid scale and anchoring so the scene reads as a stable physical world at different zoom distances.
- Fixed Pattern Generator textures appearing pixelated by rendering them at native quality with appropriate texture filtering.
- Fixed rotation gizmos remaining on default world axes when local axes were selected.

#### XML placement, transforms, and selection

- Fixed incorrect 3D slice placement by deriving initial pivot positions directly from Resolume input-map coordinates and the master physical pixel scale.
- Fixed mixed-pitch sizing so each screen uses its own physical pitch while the composition retains one consistent master coordinate scale.
- Fixed transform fields showing floating-point noise for values that resolve cleanly, such as -7.5 or 4.5 metres.
- Fixed selection delays and made selected-state feedback more responsive.
- Fixed transform values updating only after releasing the gizmo instead of during the drag.
- Fixed multi-selection edits being interpreted only as a group transform when per-screen values were intended.
- Fixed changing multiple selected slices back to **Inherit global source**.
- Fixed the automatic curve-driven depth override; the chosen extrusion now remains under user control at every curve angle.

#### Live inputs

- Fixed NDI discovery returning only remote-connection entries while omitting active local/network senders.
- Fixed NDI low-latency reception using an overly compressed proxy; it now receives the full NDI raster and creates its local low-latency texture from the newest available frame.
- Reduced NDI frame backlog and latency by discarding stale queued frames before display.
- Fixed NDI and Spout freezing or going black after switching quality modes by restarting the native receiver automatically.
- Fixed Spout textures being vertically mirrored.
- Fixed Spout low-latency alpha/black handling that previously held the last frame when a Resolume fader reached black.
- Fixed source changes retaining the previous native receiver until users disconnected it manually.
- Preserved the working Video Devices implementation as its own source type.

#### Export and desktop

- Fixed GLB/glTF compatibility problems caused by importer-dependent compression and packaging.
- Fixed OBJ world placement by exporting one complete scene with transforms baked into vertices; OBJ's lack of standardized editable local pivots is documented in the package.
- Fixed MVR files that imported empty, omitted some slices, or produced inconsistent screen scales by targeting MVR 1.5 and embedding the complete scene as one GLB resource.
- Fixed desktop fullscreen so only the live viewer enters fullscreen and Escape exits as expected.
- Fixed the Windows portable packaging configuration and added build validation for published web and desktop artifacts.

### Known beta limitations

- NDI and Spout require the Windows desktop build and are unavailable in a standard web browser.
- High-resolution NDI, Spout, and video-device feeds increase decoding, memory, GPU-upload, and rendering load; NDI High Quality can have more latency on demanding sources or systems.
- OBJ preserves geometry, UVs, and final world placement but cannot represent the editable per-object pivot hierarchy used by Pattern Lab. Use GLB, glTF, or MVR when hierarchy and transform nodes matter.
- MVR export targets version 1.5 for compatibility and carries mesh geometry rather than lighting-fixture data.
- The Windows beta executable is unsigned, so Microsoft Defender SmartScreen may show an unknown-publisher warning.

### Release artifact

- Windows portable: `LO2S-Pattern-Lab-3D-Beta-1.2.0-beta-Portable.exe`
- SHA-256: `8A7CC3E24951EAC3881E04B4214842A163B0824B154EEBBB20F270BA154591B3`

## [1.0.1] - 2026-07-31

Previous stable release and comparison baseline for v1.2.0 Beta. See the [v1.0.1 release](https://github.com/johnjjdave/lo2s-pattern-lab/releases/tag/v1.0.1) for its packaged files.

[1.2.0 Beta]: https://github.com/johnjjdave/lo2s-pattern-lab/compare/v1.0.1...v1.2.0-beta

