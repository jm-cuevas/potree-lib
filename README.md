# potree-lib

A **headless, modern npm port of the [Potree](https://github.com/potree/potree)
1.8 point-cloud viewer engine**, built on top of a normal peer-dependency
[three.js](https://threejs.org/).

`potree-lib` extracts Potree's actual engine — the viewer/render pipeline,
every supported point-cloud and vector loader, the point-cloud materials and
shaders, the navigation controls, the measurement / clipping / profile /
annotation tools, the 360°- and oriented-image modules, and the measurement /
profile exporters — and ships it as a maintainable ES-module package with
per-feature subpath entry points. It deliberately **drops the entire jQuery /
jstree / i18next / spectrum / d3 sidebar UI**: the pieces that were fused to the
DOM are split so the pure three.js / data model ships here and the
DOM-rendering half is left as a documented extension point for the consuming
app.

- **ESM only.** Modern `import`, JSDoc types compiled to `.d.ts`.
- **`three` is a peer dependency** (`>=0.169.0`), not a bundled fork. The three
  prototype monkeypatches Potree used are plain exported functions here.
- **WebGL2.** three.js has required a WebGL2 context since r163; the shaders
  were upgraded to GLSL ES 3.00 accordingly.
- **Subpath exports.** Import only what you use — `potree-lib/core`,
  `/loaders`, `/materials`, `/navigation`, `/tools`, `/modules`, `/exporters`,
  `/utils`.

> Status: feature port complete (Phases 0–6). Version `0.1.0`, not yet
> published to npm.

---

## Install

```sh
npm install potree-lib three
```

`three` (and, if you use `checkJs`/TypeScript against the source, `@types/three`)
is a peer dependency you install yourself, so the version is under your control.

Some loaders pull their own runtime dependencies (bundled by your app's bundler
when you import that subpath, never otherwise):

| Subpath | Extra runtime deps pulled in |
| --- | --- |
| `potree-lib/loaders` | `copc`, `laz-perf` (LAS/LAZ + EPT/COPC), `@ngageoint/geopackage` + `rtree-sql.js` (GeoPackage), `shapefile` (Shapefile) |
| `potree-lib/utils`, `potree-lib/tools`, `potree-lib/modules` | `proj4` (azimuth/north helpers), `@tweenjs/tween.js` (camera/annotation animation) |

---

## Subpath exports

| Import | Contents |
| --- | --- |
| `potree-lib/core` | `Viewer`, `Scene`, `View`, `NavigationCube`, the renderers (`Renderer`, `PotreeRenderer`, `EDLRenderer`, `HQSplatRenderer`), `EventDispatcher`, `Features`, `Enum`, and all the `defines.js` enums (`CameraMode`, `ClipTask`, `ClipMethod`, `PointSizeType`, `PointShape`, `LengthUnits`, …) plus the camera helpers (`zoomTo`, `distanceToPlaneWithNegative`, …). |
| `potree-lib/loaders` | `loadPointCloud` (format-sniffing dispatcher) and the individual loaders: POC (`POCLoader`/`BinaryLoader`/`LasLazLoader`), EPT + COPC (`EptLoader`/`CopcLoader`, laszip only), octree 2.0 (`OctreeLoader`), vector (`GeoPackageLoader`, `ShapefileLoader`); the octree LOD engine (`PointCloudOctree`, `PointCloudOctreeGeometry`, `updatePointClouds`); `PointAttributes`, `Version`. |
| `potree-lib/materials` | `PointCloudMaterial`, `EyeDomeLightingMaterial`, `NormalizationMaterial`, `NormalizationEDLMaterial`, `Gradients`, `ClassificationScheme`. |
| `potree-lib/navigation` | `InputHandler`, `OrbitControls`, `FirstPersonControls`, `EarthControls`, `DeviceOrientationControls`, `VRControls`, `KeyCodes`. |
| `potree-lib/tools` | `MeasuringTool`/`Measure`, `VolumeTool`/`Volume`/`BoxVolume`/`SphereVolume`, `ClippingTool`/`ClipVolume`/`PolygonClipVolume`, `ProfileTool`/`Profile`/`ProfileRequest`, `TransformationTool`, `ScreenBoxSelectTool`, `AnnotationTool`/`Annotation`, `Box3Helper`/`PointCloudSM`/`SpotLightHelper`. |
| `potree-lib/modules` | `Images360`/`Images360Loader`, `OrientedImages`/`OrientedImageLoader`/`OrientedImageControls`, `CameraAnimation`/`ControlPoint`. |
| `potree-lib/exporters` | `CSVExporter`, `LASExporter`, `DXFExporter`, `DXFProfileExporter`, `GeoJSONExporter`. |
| `potree-lib/utils` | geometry / geo / texture / debug / camera / misc helpers, `TextSprite`, `AnimationPath`, `LRU`, `WorkerPool`, `XHRFactory`, `Points`, … |

Each subpath resolves to `dist/<name>/index.js` with a matching
`dist/<name>/index.d.ts`. The bundles share code through `dist/shared/*`
chunks; `potree-lib/utils` resolves standalone (it never pulls in the viewer).

---

## Quick start

```js
import { Viewer } from "potree-lib/core";
import { loadPointCloud } from "potree-lib/loaders";

const el = document.getElementById("viewer"); // a plain element; a <canvas> is created inside
const viewer = new Viewer(el);

viewer.setBackground("gradient");
viewer.setPointBudget(2_000_000);
viewer.setEDLEnabled(true);

// The render loop starts itself (three's setAnimationLoop) — no manual rAF.

loadPointCloud(
  "https://example.com/pointclouds/lion/ept.json",
  "lion",
  (e) => {
    const pointcloud = e.pointcloud;
    pointcloud.material.size = 1;
    pointcloud.material.pointSizeType = 2; // PointSizeType.ADAPTIVE
    viewer.scene.addPointCloud(pointcloud);
    viewer.fitToScreen();
  },
);
```

`loadPointCloud(path, name, callback)` sniffs the format from the URL:

| URL ends with | Format |
| --- | --- |
| `ept.json` | EPT (Entwine Point Tile), laszip nodes only |
| `.copc.laz` | COPC (Cloud-Optimized Point Cloud) |
| `cloud.js` | legacy Potree octree ("POC") |
| `metadata.json` | Potree current-gen binary octree ("2.0"), plain + brotli |

Omit the callback to get a `Promise<{ type, pointcloud }>` back instead.

---

## Core

### `new Viewer(domElement, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `resourcePath` | `null` | Base URL for optional assets — navigation-cube face textures, the skybox background, the transform-gizmo focus icon, the oriented-image placeholder. Everything degrades gracefully when it is `null`. |
| `onPointCloudLoaded` | `() => {}` | Convenience hook. |

Key methods (all from Potree, GUI-free): `setScene` / `setControls` /
`getControls`, `setBackground("gradient" \| "skybox" \| "black" \| "white" \| null)`,
`setPointBudget` / `getPointBudget`, `setEDLEnabled` / `setEDLRadius` /
`setEDLStrength` / `setEDLOpacity`, `setFOV`, `setMoveSpeed`,
`setClipTask` / `setClipMethod`, `setCameraMode(CameraMode.*)`,
`setClassifications` / `setClassificationVisibility`,
`setFilterReturnNumberRange` / `setFilterNumberOfReturnsRange` /
`setFilterGPSTimeRange` / `setFilterPointSourceIDRange`,
`fitToScreen`, `zoomTo`, `setTopView` / `setFrontView` / … ,
`toggleNavigationCube`, `setShowBoundingBox`, `setLengthUnit`.

`Viewer` is an `EventDispatcher`. Useful events: `update` (every frame, before
render — the hook a consuming UI syncs its DOM against), `scene_changed`,
`background_changed`, `controls_start` / `controls_end` (drag begin/end —
the documented place to toggle `pointer-events` on your own annotation DOM),
`webglcontextlost`.

### `Scene`

`viewer.scene` holds `pointclouds`, `measurements`, `volumes`, `profiles`,
`polygonClipVolumes`, `annotations` (a tree — `scene.annotations.flatten()`),
`cameraAnimations`, plus `view` (the `View`: `position`, `lookAt(target)`,
`radius`, yaw/pitch) and the cameras. Add/remove with `addPointCloud` /
`addMeasurement` / `addVolume` / `removeVolume` / `addProfile` /
`addPolygonClipVolume` / `add360Images` / `addOrientedImages` /
`addCameraAnimation` / `addAnnotation` and the `removeAll*` helpers.
`addPointCloud` fires a `pointcloud_added` event on the scene (which is also an
`EventDispatcher`); for the rest, react on the `viewer`'s per-frame `update`
event.

`Viewer` constructs **none** of the tools — core must not depend on the tools
subpath. Wire the ones you want yourself (see below).

---

## Navigation

`Viewer` builds one of each control up front (`viewer.orbitControls`,
`viewer.fpControls`, `viewer.earthControls`, `viewer.deviceControls`,
`viewer.vrControls`) and activates `orbitControls`. Switch with `setControls`:

```js
viewer.setControls(viewer.fpControls);    // first-person
viewer.setControls(viewer.earthControls); // earth/globe
viewer.setControls(viewer.orbitControls); // back to the default
```

`InputHandler` (constructed by `Viewer`) is the shared mouse/keyboard/drag
dispatcher every tool and control listens to. `VRControls` +
`DeviceOrientationControls` are ported; the WebXR controller model factory now
comes from `three/examples/jsm/webxr/…`. `GeoControls` was upstream dead code
and is not ported.

---

## Materials

```js
import { PointCloudMaterial, Gradients } from "potree-lib/materials";
```

`PointCloudMaterial` is the `RawShaderMaterial` that drives point size / shape /
colour mode / elevation gradient / classification / clipping. It is compiled by
the custom raw-WebGL `Renderer`, not by three's program assembly. If you pass a
`resourcePath` it can also build a matcap texture; without one it returns
`null` and the renderer skips it. The legacy typed-uniform `{ type, value }`
objects are plain `{ value }` now, and `THREE.VertexColors` is
`vertexColors: true`.

---

## Tools

Every DOM-coupled Potree tool is split. The **headless three.js / data model
ships in `potree-lib/tools`**; the DOM half (sidebar panels, SVG overlays,
marquee `<div>`s, the d3 profile chart, annotation popups) is **not** in the
package — you build it, driven off the events these classes emit.

```js
import {
  MeasuringTool, VolumeTool, ProfileTool,
  ClippingTool, TransformationTool, ScreenBoxSelectTool, AnnotationTool,
} from "potree-lib/tools";

viewer.measuringTool = new MeasuringTool(viewer);
viewer.volumeTool = new VolumeTool(viewer);
viewer.profileTool = new ProfileTool(viewer);
viewer.transformationTool = new TransformationTool(viewer);
viewer.clippingTool = new ClippingTool(viewer);
viewer.clippingTool.setScene(viewer.scene);
viewer.screenBoxSelectTool = new ScreenBoxSelectTool(viewer);
viewer.annotationTool = new AnnotationTool(viewer);

// then, on your own toolbar buttons — args match Potree 1.8's sidebar verbatim:
viewer.measuringTool.startInsertion({ showDistances: true, closed: false, name: "Distance" });
viewer.volumeTool.startInsertion();                       // measurement box
viewer.volumeTool.startInsertion({ clip: true });         // clip box
viewer.clippingTool.startInsertion({ type: "polygon" });  // clip polygon
viewer.profileTool.startInsertion();
viewer.annotationTool.startInsertion({ title: "Note", description: "…" });
```

### Extension-point events

Because the DOM feedback is yours to draw:

| Tool | Events (all payloads in screen pixels where relevant) |
| --- | --- |
| `MeasuringTool` / `Measure` | `start_inserting_measurement`; `marker_added` / `marker_moved` / `marker_removed` / `marker_dropped` |
| `VolumeTool` | `start_inserting_volume` |
| `ProfileTool` | `start_inserting_profile` |
| `ClippingTool` | `clip_polygon_started` / `clip_polygon_vertex_added` / `clip_polygon_vertex_moved` / `clip_polygon_finished` — draw the insertion overlay from these |
| `ScreenBoxSelectTool` | `select_box_start` / `select_box_drag` (payload carries a `THREE.Box2`) / `select_box_drop` |
| `AnnotationTool` / `Annotation` | `start_inserting_annotation`; the `Annotation` tree carries only data + `moveHere()` — render the popup/marker yourself and sync it each `update` |
| `TransformationTool` | select a volume (left-click) → drag the on-object gizmo handles; the default `PotreeRenderer` renders the gizmo scene every frame |

A clip volume / polygon only *visibly* does something when the clip task is
`SHOW_INSIDE` / `SHOW_OUTSIDE` (the default `HIGHLIGHT` merely tints clipped
points): `viewer.setClipTask(ClipTask.SHOW_INSIDE)`.

`ScreenBoxSelectTool` requires the orthographic camera —
`viewer.setCameraMode(CameraMode.ORTHOGRAPHIC)` first (Potree's sidebar does
the same).

The `examples/` dev harness is a full worked example of the consuming-app side
of all of this.

---

## Modules

```js
import { CameraAnimation, Images360Loader, OrientedImageLoader } from "potree-lib/modules";

// Catmull-Rom camera fly-through
const anim = CameraAnimation.defaultFromView(viewer);
viewer.scene.addCameraAnimation(anim);
anim.setDuration(6);
anim.play();

// 360° panoramas — a coordinates file + one image per station
const set = await Images360Loader.load("/pano", viewer);
viewer.scene.add360Images(set);
// click a station sphere to fly in; set.unfocus() to leave. Events: focus / unfocus

// oriented images — camera XML + image-params list
const oi = await OrientedImageLoader.load("/cam.xml", "/images.txt", viewer);
viewer.scene.addOrientedImages(oi);
// hover a photo plane to clip the cloud to its frustum; oi.controls.pan(dx, dy) / zoom(d) / release()
```

The raw-SVG path-handle editor (`CameraAnimation`), the five jQuery arrow
buttons (`OrientedImageControls`) and the "unfocus" `<input>` (`Images360`) are
dropped; the underlying pan/zoom/spline math is exposed as methods
(`pan`/`zoom`/`release`, `unfocus`) and events (`controlpoint_added`/`…removed`,
`capture`/`release`).

---

## Exporters

Pure data transforms — they return a `string` or an `ArrayBuffer`; writing it
to a file (a `Blob` + `<a download>`, `fs.writeFile`, …) is up to you.

```js
import {
  CSVExporter, LASExporter, DXFProfileExporter,   // consume a "Points" object
  DXFExporter, GeoJSONExporter,                    // consume Measure(s)
} from "potree-lib/exporters";

// measurements -> vector formats
const geojson = GeoJSONExporter.toString(viewer.scene.measurements);
const dxf = DXFExporter.toString(viewer.scene.measurements);

// profile query -> point formats
const merged = new Points(); // from potree-lib/utils
pointcloud.getPointsInProfile(profile, null, {
  onProgress: (e) => e.points.segments.forEach((s) => merged.add(s.points)),
  onCancel: () => {},
  onFinish: () => {
    const csv = CSVExporter.toString(merged);
    const lasBuffer = LASExporter.toLAS(merged);          // uncompressed LAS 1.2
    const sectionDxf = DXFProfileExporter.toString(merged, /* flatten */ true);
  },
});
```

A *"Points"* object is `{ numPoints, boundingBox, data: { position, rgba,
intensity, classification, mileage, … } }` — the shape produced by the profile
tool. `DXFExporter` / `GeoJSONExporter` accept one `Measure` or an array and
ignore anything that is not a measurement.

---

## Building a UI on top

`potree-lib` renders the 3D scene and nothing else — no toolbar, no sidebar, no
overlays. To build a full viewer UI:

1. **Create the `Viewer`** on your container element and drive its setters from
   your controls.
2. **Wire the tools you want** onto the viewer instance (they are never
   auto-constructed) and render their DOM feedback from the events listed
   above.
3. **Sync your DOM each frame** on the `viewer`'s `update` event — annotation
   markers/popups, measurement panels, the profile chart, clip-polygon
   overlays.
4. **Toggle `pointer-events`** on your overlay DOM using `controls_start` /
   `controls_end` so a drag on the canvas is not eaten by your UI.
5. Provide **`resourcePath`** if you want the skybox background, textured
   navigation cube, or gizmo icons.

The permanently-out-of-scope Potree pieces (no non-DOM logic to extract):
the Leaflet minimap (`MapView`/`map.js`), `Compass`, `Message`,
`HierarchicalSlider`, the sidebar itself.

Features intentionally **not ported** (dead or broken in the upstream 1.8
checkout — verified, not assumed): EPT's own `binary`/`zstandard` node formats
(only laszip EPT/COPC works), the Arena4D `.vpc` KD-tree format, DEM generation
(`Potree.DEM` was never committed), the `Action` UI-button base class,
`GeoControls`, `BlurMaterial`. See `.memory/IMPLEMENTATION_PLAN.md` for the
full phase-by-phase record.

---

## Workers

The decoder workers (`BinaryDecoderWorker`, `LASDecoderWorker`,
`EptLaszipDecoderWorker`, `octree2/DecoderWorker`, `octree2/DecoderWorker_brotli`)
build as real files under `dist/workers/` and are addressed at runtime with
plain `new URL("../workers/Foo.js", import.meta.url)` — standard module
resolution that any downstream bundler (Vite, webpack 5, Rollup, esbuild)
understands. They are ES-module workers (`{ type: "module" }`). The
`laz-perf` WASM is inlined into the worker bundle as a base64 `data:` URI in
production builds, so there is no extra asset to deploy.

---

## Requirements

- A **WebGL2** context (three.js r163+ requirement).
- **three.js `>=0.169.0`** — the floor actually built and browser-tested
  against.
- A bundler that supports `import.meta.url` worker resolution and subpath
  `exports` (any current one does).

---

## Development

```sh
npm install
npm run dev        # Vite dev server rooted at examples/ — the manual smoke harness
npm run build      # Vite multi-entry ESM + worker bundles, then tsc -d for .d.ts
npm run typecheck  # tsc --checkJs, no emit
npm test           # node --test — headless unit tests for the exporters
```

The source is JSDoc-annotated JS checked with `tsc --checkJs`; `.d.ts` files
are generated, not hand-written. `examples/main.js` is the running
consuming-app reference and doubles as the per-phase smoke test (it loads a
real EPT+LAZ sample and exercises the tools, modules and exporters).

---

## License

**BSD 2-Clause.** `potree-lib` is a derivative work of Potree and is
distributed under Potree's own license.

- Copyright (c) 2011–2020, Markus Schütz — original Potree source
- Copyright (c) 2026, Juan Cuevas — potree-lib port

See [`LICENSE`](./LICENSE) for the full text and
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md) for the vendored
components (plas.io / laz-perf — MIT; Google's brotli decoder — MIT; the binary
heap — MIT) and their copyright notices. npm dependencies carry their own
licenses in `node_modules/`.

Potree is a project by Markus Schütz. This port is not affiliated with or
endorsed by the Potree project.
