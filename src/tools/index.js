// Measurement, clipping/volumes, profile, transform gizmo, screen select — ported in Phase 4.
// Annotation.js (headless data/tree model) landed early in Phase 1 since
// core/Scene.js depends on it; AnnotationTool.js (drag-to-place insertion
// logic) still lands in Phase 4.
export {Annotation} from "./annotations/Annotation.js";

// Box3Helper (pure three.js LineSegments box outline) and PointCloudSM
// (single-light shadow-map render target) landed early in Phase 2: the
// octree LOD update (`updateVisibility`) needs Box3Helper for
// `pointcloud.showBoundingBox`, and EDLRenderer's constructor hard-depends
// on PointCloudSM. `tools/helpers/SpotLightHelper.js` still lands in Phase 4.
export {Box3Helper} from "./helpers/Box3Helper.js";
export {PointCloudSM} from "./helpers/PointCloudSM.js";
