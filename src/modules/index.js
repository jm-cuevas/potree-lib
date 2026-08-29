// Phase 5 - higher-level modules built on top of the core viewer:
//
//   - images360/         360° panorama sets (equirectangular sphere, click to
//                        fly + focus)
//   - oriented-images/   georeferenced photos as scene overlays with a
//                        frustum clip in front of the point cloud
//   - camera-animation/  Catmull-Rom camera fly-through paths
//
// Every DOM-coupled upstream half is dropped the same way Phase 4 handled the
// tools: the raw "unfocus" button (Images360), the jQuery directional pan
// buttons (OrientedImageControls) and the raw-SVG draggable path-handle editor
// (CameraAnimation) are gone. The engine-side behaviour is intact and each
// class emits events (`focus`/`unfocus`, `capture`/`release`,
// `controlpoint_added`/`controlpoint_removed`, ...) for a consuming app to
// build its own UI on.

// 360° panoramas
export {Image360, Images360, Images360Loader} from "./images360/Images360.js";

// Oriented / georeferenced images
export {OrientedImage, OrientedImages, OrientedImageLoader} from "./oriented-images/OrientedImages.js";
export {OrientedImageControls} from "./oriented-images/OrientedImageControls.js";

// Camera path animation
export {ControlPoint, CameraAnimation} from "./camera-animation/CameraAnimation.js";
