// Phase 4 - measurement, clipping/volumes, profile, transform gizmo, screen
// box select, annotations. Each DOM-coupled upstream tool is split: the
// headless three.js / data model ships here, the DOM-rendering half (sidebar
// panels, SVG overlays, marquee divs, d3 profile chart, annotation popups)
// is left to the consuming app and driven off the events these classes emit.
//
// `Viewer` does NOT construct any of these (core must not depend on the
// tools subpath). A consuming app wires the ones it wants, e.g.:
//   viewer.measuringTool = new MeasuringTool(viewer);
//   viewer.clippingTool  = new ClippingTool(viewer);
//   viewer.clippingTool.setScene(viewer.scene);
//   viewer.transformationTool = new TransformationTool(viewer);
// (`Viewer` already null-guards `clippingTool` / `transformationTool`.)

// Measurement
export {Measure} from "./measure/Measure.js";
export {MeasuringTool} from "./measure/MeasuringTool.js";

// Clipping / volumes
export {Volume, BoxVolume, SphereVolume} from "./clipping/Volume.js";
export {VolumeTool} from "./clipping/VolumeTool.js";
export {ClipVolume} from "./clipping/ClipVolume.js";
export {PolygonClipVolume} from "./clipping/PolygonClipVolume.js";
export {ClippingTool} from "./clipping/ClippingTool.js";

// Profile / cross-section
export {Profile} from "./profile/Profile.js";
export {ProfileTool} from "./profile/ProfileTool.js";
export {ProfileData, ProfileRequest} from "./profile/ProfileRequest.js";

// Transform gizmo
export {TransformationTool} from "./transform/TransformationTool.js";

// Screen-space box select
export {ScreenBoxSelectTool} from "./select/ScreenBoxSelectTool.js";

// Annotations - Annotation.js (headless data/tree model) landed in Phase 1
// because core/Scene.js depends on it; AnnotationTool.js (drag-to-place) is
// the Phase 4 half.
export {Annotation} from "./annotations/Annotation.js";
export {AnnotationTool} from "./annotations/AnnotationTool.js";

// Pure three.js visual / shadow helpers. Box3Helper + PointCloudSM landed in
// Phase 2 (the octree LOD update and EDLRenderer need them); SpotLightHelper
// is the Phase 4 addition.
export {Box3Helper} from "./helpers/Box3Helper.js";
export {PointCloudSM} from "./helpers/PointCloudSM.js";
export {SpotLightHelper} from "./helpers/SpotLightHelper.js";
