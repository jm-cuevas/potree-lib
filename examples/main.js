// Dev harness for potree-lib.
//
// Phase 2 smoke test: create a Viewer, load a real EPT+LAZ sample (via the
// copc-backed EPT loader) to confirm the loader chain + octree LOD engine
// render real point data.
//
// Phase 4 smoke test: wire the headless tools onto the viewer exactly the way
// Potree 1.8's own sidebar does (`viewer.measuringTool.startInsertion({...})`
// etc. - see `.context/potree/src/viewer/sidebar.js`) and expose a button bar
// that mirrors that toolbar. The library ships NO UI, so this file also plays
// the part of a consuming app: it renders a small sphere for every annotation
// (annotations are a headless data model with no built-in visual) and offers
// clip-task / clip-method / camera-mode selectors.
//
// Phase 5 smoke test: the "Modules" group wires the three higher-level modules
// - a Catmull-Rom camera fly-through (real, against the loaded cloud), plus a
// 360° panorama set and an oriented-image set loaded from the small synthetic
// fixtures under `examples/fixtures/` (run `python3 examples/fixtures/make-fixtures.py`
// to regenerate). No real 360/oriented sample sets ship with Potree 1.8.
//
// Phase 6 smoke test: the "Export" group feeds `viewer.scene.measurements` to
// the GeoJSON / DXF exporters and a merged profile-query `Points` to the CSV /
// LAS / DXF-of-points exporters, then downloads each result (a consuming-app
// concern - the library only returns strings / ArrayBuffers). Pure exporter
// logic is also covered headlessly in `test/exporters.test.mjs` (`npm test`).
import * as THREE from "three";
import { Viewer } from "../src/core/index.js";
import { loadPointCloud } from "../src/loaders/index.js";
import { ClipTask, ClipMethod, CameraMode } from "../src/core/defines.js";
import {
	MeasuringTool,
	VolumeTool,
	ProfileTool,
	ClippingTool,
	TransformationTool,
	ScreenBoxSelectTool,
	AnnotationTool,
	SphereVolume,
} from "../src/tools/index.js";
import {
	CameraAnimation,
	Images360Loader,
	OrientedImageLoader,
} from "../src/modules/index.js";
import { Points } from "../src/utils/index.js";
import {
	CSVExporter,
	LASExporter,
	DXFExporter,
	DXFProfileExporter,
	GeoJSONExporter,
} from "../src/exporters/index.js";

console.log("potree-lib dev harness", { three: THREE.REVISION });

const app = document.getElementById("app");

const status = document.createElement("div");
status.style.cssText =
	"position:absolute;z-index:10;color:#eee;font:13px monospace;padding:0.75rem;pointer-events:none;text-shadow:0 1px 2px black;white-space:pre;";
status.textContent = "creating Viewer…";
app.appendChild(status);

const viewer = new Viewer(app, { resourcePath: null });
viewer.setBackground("gradient");
viewer.scene.view.position.set(10, 10, 10);
viewer.scene.view.lookAt(new THREE.Vector3(0, 0, 0));
window.__viewer = viewer;

// --- attach tools exactly like Potree's viewer.js does (core never does it) --
viewer.measuringTool = new MeasuringTool(viewer);
viewer.volumeTool = new VolumeTool(viewer);
viewer.profileTool = new ProfileTool(viewer);
viewer.transformationTool = new TransformationTool(viewer);
viewer.clippingTool = new ClippingTool(viewer);
viewer.clippingTool.setScene(viewer.scene);
viewer.screenBoxSelectTool = new ScreenBoxSelectTool(viewer);
viewer.annotationTool = new AnnotationTool(viewer);

const logEvt = (label) => (e) => console.log(`[${label}] ${e.type}`, e);
viewer.measuringTool.addEventListener("start_inserting_measurement", logEvt("measure"));
viewer.volumeTool.addEventListener("start_inserting_volume", logEvt("volume"));
viewer.profileTool.addEventListener("start_inserting_profile", logEvt("profile"));
viewer.clippingTool.addEventListener("clip_polygon_started", logEvt("clip"));
viewer.clippingTool.addEventListener("clip_polygon_finished", logEvt("clip"));
viewer.annotationTool.addEventListener("start_inserting_annotation", logEvt("annotation"));

// --- consuming-app concern: on-canvas feedback while placing a clip polygon --
// The headless `ClippingTool` dropped Potree's jQuery SVG overlay and instead
// emits `clip_polygon_started` / `clip_polygon_vertex_added` /
// `clip_polygon_vertex_moved` / `clip_polygon_finished` (all in screen pixels).
// A real app draws whatever it wants from those — here, a dashed polyline plus
// a dot per committed vertex, exactly like Potree's built-in overlay.
const clipSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
// explicit width/height: an <svg> is a replaced element, so `inset:0` alone
// won't stretch it — without this it stays 300x150 and the vertices fall
// outside its viewport.
clipSvg.setAttribute("style", "position:absolute;left:0;top:0;width:100%;height:100%;z-index:12;pointer-events:none;");
clipSvg.innerHTML =
	'<polyline fill="none" stroke="#000" stroke-width="4" stroke-dasharray="9,6" />' +
	'<polyline fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5,10" />';
app.appendChild(clipSvg);
const clipPolylines = clipSvg.querySelectorAll("polyline");
let clipVerts = []; // committed [x,y] pixel pairs
let clipTrailing = null; // rubber-banded pointer position
function drawClipOverlay() {
	const pts = [...clipVerts, clipTrailing].filter(Boolean).map(([x, y]) => `${x},${y}`).join(" ");
	clipPolylines.forEach((p) => p.setAttribute("points", pts));
	[...clipSvg.querySelectorAll("circle")].forEach((c) => c.remove());
	for (const [x, y] of clipVerts) {
		const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "5");
		c.setAttribute("fill", "#fff"); c.setAttribute("stroke", "#000"); c.setAttribute("stroke-width", "2");
		clipSvg.appendChild(c);
	}
}
viewer.clippingTool.addEventListener("clip_polygon_started", () => {
	clipVerts = []; clipTrailing = null; drawClipOverlay();
	setHint("Clip polygon: left-click to add vertices, right-click to finish");
});
viewer.clippingTool.addEventListener("clip_polygon_vertex_added", (e) => {
	clipVerts.push([e.x, e.y]); drawClipOverlay();
});
viewer.clippingTool.addEventListener("clip_polygon_vertex_moved", (e) => {
	clipTrailing = [e.x, e.y]; drawClipOverlay();
});
viewer.clippingTool.addEventListener("clip_polygon_finished", () => {
	clipVerts = []; clipTrailing = null; drawClipOverlay();
	setHint("");
});

// small transient hint line under the status text
const hint = document.createElement("div");
hint.style.cssText =
	"position:absolute;left:0;top:2.4rem;z-index:10;color:#8fd0ff;font:12px monospace;padding:0 0.75rem;pointer-events:none;text-shadow:0 1px 2px black;white-space:pre;";
app.appendChild(hint);
function setHint(t) { hint.textContent = t; }

// --- consuming-app concern: render a marker per annotation ------------------
// The headless `Annotation` model carries only data + events; a real app draws
// the popup/marker. Here: one small sphere per annotation, kept in sync each
// frame (the position changes while it is being drag-placed).
const annotationMarkers = new THREE.Group();
annotationMarkers.name = "annotation_markers";
viewer.scene.scene.add(annotationMarkers);
const markerBySprite = new Map();

function syncAnnotationMarkers() {
	const live = viewer.scene.annotations.flatten().filter((a) => a.position);
	for (const a of live) {
		let m = markerBySprite.get(a);
		if (!m) {
			m = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 16),
				new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false })
			);
			m.renderOrder = 1000;
			annotationMarkers.add(m);
			markerBySprite.set(a, m);
		}
		m.position.copy(a.position);
		// keep it a roughly constant screen size
		const cam = viewer.scene.getActiveCamera();
		const d = cam.position.distanceTo(a.position);
		const s = Math.max(d / 80, 0.02);
		m.scale.set(s, s, s);
		m.visible = a.visible;
	}
	for (const [a, m] of markerBySprite) {
		if (!live.includes(a)) {
			annotationMarkers.remove(m);
			markerBySprite.delete(a);
		}
	}
}
viewer.addEventListener("update", syncAnnotationMarkers);

// --- button bar (harness only) --------------------------------------------
const bar = document.createElement("div");
bar.style.cssText =
	"position:absolute;z-index:11;right:0;top:0;display:flex;flex-direction:column;gap:3px;padding:8px;font:12px system-ui,sans-serif;max-height:100vh;overflow:auto;";
app.appendChild(bar);

function group(title) {
	const h = document.createElement("div");
	h.textContent = title;
	h.style.cssText = "color:#ccc;margin-top:8px;font-weight:600;text-shadow:0 1px 2px #000;";
	bar.appendChild(h);
}
function button(label, fn) {
	const b = document.createElement("button");
	b.textContent = label;
	b.style.cssText = "padding:4px 8px;cursor:pointer;text-align:left;";
	b.addEventListener("click", () => {
		try {
			const r = fn();
			console.log(`▶ ${label}`, r ?? "");
		} catch (err) {
			console.error(`tool "${label}" failed`, err);
		}
	});
	bar.appendChild(b);
	return b;
}
function select(label, options, fn) {
	const wrap = document.createElement("label");
	wrap.style.cssText = "display:flex;gap:6px;align-items:center;color:#ddd;text-shadow:0 1px 2px #000;";
	wrap.textContent = label;
	const sel = document.createElement("select");
	for (const [k, v] of options) {
		const o = document.createElement("option");
		o.value = String(v);
		o.textContent = k;
		sel.appendChild(o);
	}
	sel.addEventListener("change", () => fn(Number(sel.value)));
	wrap.appendChild(sel);
	bar.appendChild(wrap);
	return sel;
}

// -- measurement (args copied verbatim from Potree sidebar.js initToolbar) --
group("Measure");
button("Angle", () => viewer.measuringTool.startInsertion({ showDistances: false, showAngles: true, showArea: false, closed: true, maxMarkers: 3, name: "Angle" }));
button("Point", () => viewer.measuringTool.startInsertion({ showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: "Point" }));
button("Distance", () => viewer.measuringTool.startInsertion({ showDistances: true, showArea: false, closed: false, name: "Distance" }));
button("Height", () => viewer.measuringTool.startInsertion({ showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: "Height" }));
button("Circle", () => viewer.measuringTool.startInsertion({ showDistances: false, showHeight: false, showArea: false, showCircle: true, showEdges: false, closed: false, maxMarkers: 3, name: "Circle" }));
button("Azimuth", () => viewer.measuringTool.startInsertion({ showDistances: false, showHeight: false, showArea: false, showCircle: false, showEdges: false, showAzimuth: true, closed: false, maxMarkers: 2, name: "Azimuth" }));
button("Area", () => viewer.measuringTool.startInsertion({ showDistances: true, showArea: true, closed: true, name: "Area" }));
button("Volume (box)", () => viewer.volumeTool.startInsertion());
button("Volume (sphere)", () => viewer.volumeTool.startInsertion({ type: SphereVolume }));
button("Profile", () => viewer.profileTool.startInsertion());
button("Annotation", () => viewer.annotationTool.startInsertion({ title: "Annotation", description: "placed from the harness" }));

// -- clipping --------------------------------------------------------------
// Note: a placed Volume / Clip Volume is moved & resized the Potree way — LEFT-
// CLICK it to select, then drag the on-object gizmo handles (spheres = scale,
// bars = translate, rings = rotate). There are no per-corner drag markers like
// measurements have. RIGHT-CLICK empty space to deselect.
group("Clip");
button("Clip Volume", () => {
	setHint("Clip Volume: move the mouse over the cloud, click to drop; then click it to select and drag its gizmo handles");
	return viewer.volumeTool.startInsertion({ clip: true });
});
button("Clip Polygon", () => viewer.clippingTool.startInsertion({ type: "polygon" }));
button("Box Select (ortho)", () => {
	// Potree's sidebar refuses this unless the active camera is orthographic
	if (viewer.scene.cameraMode !== CameraMode.ORTHOGRAPHIC) {
		viewer.setCameraMode(CameraMode.ORTHOGRAPHIC);
		camSel.value = String(CameraMode.ORTHOGRAPHIC);
	}
	return viewer.screenBoxSelectTool.startInsertion();
});
button("Remove all clip volumes", () => viewer.scene.removeAllClipVolumes());

// default to SHOW_INSIDE so a fresh clip volume / polygon visibly does
// something (HIGHLIGHT only tints the clipped points, easy to miss)
const clipTaskSel = select("Clip task", [["NONE", ClipTask.NONE], ["HIGHLIGHT", ClipTask.HIGHLIGHT], ["SHOW_INSIDE", ClipTask.SHOW_INSIDE], ["SHOW_OUTSIDE", ClipTask.SHOW_OUTSIDE]], (v) => viewer.setClipTask(v));
clipTaskSel.value = String(ClipTask.SHOW_INSIDE);
viewer.setClipTask(ClipTask.SHOW_INSIDE);
select("Clip method", [["INSIDE_ANY", ClipMethod.INSIDE_ANY], ["INSIDE_ALL", ClipMethod.INSIDE_ALL]], (v) => viewer.setClipMethod(v));

// -- misc ---------------------------------------------------------------
group("Scene");
const camSel = select("Camera", [["Perspective", CameraMode.PERSPECTIVE], ["Orthographic", CameraMode.ORTHOGRAPHIC]], (v) => viewer.setCameraMode(v));
camSel.value = String(CameraMode.PERSPECTIVE);
button("Clear measurements", () => viewer.scene.removeAllMeasurements());
button("Dump scene", () => console.log("scene", {
	measurements: viewer.scene.measurements,
	volumes: viewer.scene.volumes,
	profiles: viewer.scene.profiles,
	polygonClipVolumes: viewer.scene.polygonClipVolumes,
	annotations: viewer.scene.annotations.flatten(),
}));

// -- Phase 6 exporters --------------------------------------------------
// `potree-lib/exporters` returns strings / ArrayBuffers only; turning one into
// a downloaded file is a consuming-app concern, shown here with a Blob + a
// throwaway <a download>.
group("Export");
function download(filename, data, mime) {
	const blob = new Blob([data], { type: mime });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function requireMeasurements() {
	const m = viewer.scene.measurements;
	if (m.length === 0) throw new Error("place a Distance / Area / Point measurement first");
	return m;
}
button("Measurements → GeoJSON", () => {
	const text = GeoJSONExporter.toString(requireMeasurements());
	download("measurements.geojson", text, "application/geo+json");
	return text;
});
button("Measurements → DXF", () => {
	const text = DXFExporter.toString(requireMeasurements());
	download("measurements.dxf", text, "application/dxf");
	return text;
});
// The profile exporters (CSV / LAS / DXF-of-points) consume a `Points`-shaped
// object. Run a profile query against the loaded cloud, merge the per-segment
// results, then hand that to each exporter.
function withProfilePoints(then) {
	const profile = viewer.scene.profiles[0];
	const pc = viewer.scene.pointclouds[0];
	if (!profile) throw new Error("place a Profile first (Measure ▸ Profile)");
	if (!pc) throw new Error("no point cloud loaded");
	setHint("profile query running…");

	// `getPointsInProfile` streams `ProfileData` (per-segment `Points`) to
	// `onProgress` as octree nodes load, and calls `onFinish` when the queue
	// drains. Merge every segment's `Points` into one and hand it on.
	const merged = new Points();
	pc.getPointsInProfile(profile, null, {
		onProgress: (e) => e.points.segments.forEach((s) => merged.add(s.points)),
		onCancel: () => setHint("profile query cancelled"),
		onFinish: () => {
			setHint("");
			if (merged.numPoints === 0) throw new Error("profile hit no points");
			then(merged);
		},
	});
}
button("Profile → CSV", () => withProfilePoints((pts) => {
	const text = CSVExporter.toString(pts);
	download("profile.csv", text, "text/csv");
	console.log("profile CSV", `${pts.numPoints} points`, text.slice(0, 200) + "…");
}));
button("Profile → LAS", () => withProfilePoints((pts) => {
	const buf = LASExporter.toLAS(pts);
	download("profile.las", buf, "application/octet-stream");
	console.log("profile LAS", `${buf.byteLength} bytes`);
}));
button("Profile → DXF (points)", () => withProfilePoints((pts) => {
	const text = DXFProfileExporter.toString(pts, /* flatten */ true);
	download("profile.dxf", text, "application/dxf");
	console.log("profile DXF", `${pts.numPoints} points`);
}));

// -- Phase 5 modules ------------------------------------------------------
group("Modules");

// The headless CameraAnimation dropped Potree's raw-SVG draggable path
// handles. A consuming app re-adds its own — here, one draggable sphere per
// control-point position (drag = unproject the pointer at the point's current
// depth and write it back to `cp.position`; the spline updates next frame).
let cameraAnimation = null;
const camPathHandles = new THREE.Group();
camPathHandles.name = "camera_path_handles";
viewer.scene.scene.add(camPathHandles);

function buildCamPathHandles() {
	camPathHandles.clear();
	if (!cameraAnimation) return;
	for (const cp of cameraAnimation.controlPoints) {
		const h = new THREE.Mesh(
			new THREE.SphereGeometry(1, 20, 20),
			new THREE.MeshBasicMaterial({ color: 0x00ff88, depthTest: false })
		);
		h.renderOrder = 1000;
		h.userData.cp = cp;
		h.addEventListener("drag", (e) => {
			const cam = viewer.scene.getActiveCamera();
			const size = viewer.renderer.getSize(new THREE.Vector2());
			const ndc = new THREE.Vector3(
				2 * (e.drag.end.x / size.width) - 1,
				-2 * (e.drag.end.y / size.height) + 1,
				cp.position.clone().project(cam).z
			);
			cp.position.copy(ndc.unproject(cam));
			e.consume?.();
		});
		camPathHandles.add(h);
	}
}
viewer.addEventListener("update", () => {
	if (!cameraAnimation) return;
	const cam = viewer.scene.getActiveCamera();
	camPathHandles.children.forEach((h) => {
		h.position.copy(h.userData.cp.position);
		const s = Math.max(cam.position.distanceTo(h.position) / 60, 0.02);
		h.scale.setScalar(s);
	});
});

button("Camera path: create", () => {
	if (cameraAnimation) {
		cameraAnimation.dispose();
		viewer.scene.removeCameraAnimation(cameraAnimation);
		viewer.scene.scene.remove(cameraAnimation.node);
	}
	cameraAnimation = CameraAnimation.defaultFromView(viewer);
	viewer.scene.addCameraAnimation(cameraAnimation);
	cameraAnimation.addEventListener("controlpoint_added", logEvt("cameraAnimation"));
	buildCamPathHandles();
	setHint("Camera path: drag the green spheres to reshape it, then 'Camera path: play'");
	return { controlPoints: cameraAnimation.controlPoints.length };
});
button("Camera path: play", () => {
	if (!cameraAnimation) throw new Error("create a camera path first");
	camPathHandles.visible = false;
	cameraAnimation.setDuration(6);
	cameraAnimation.play();
	setTimeout(() => (camPathHandles.visible = true), 6500);
});

let images360 = null;
button("Load 360° set (fixture)", async () => {
	if (images360) {
		images360.dispose();
		viewer.scene.remove360Images(images360);
		viewer.scene.scene.remove(images360.node);
	}
	images360 = await Images360Loader.load("/fixtures/images360", viewer);
	viewer.scene.add360Images(images360);
	images360.addEventListener("focus", logEvt("images360"));
	images360.addEventListener("unfocus", logEvt("images360"));
	console.log("360° set", images360, `${images360.images.length} images — click a sphere to focus`);
	return { images: images360.images.length };
});
button("360°: unfocus", () => images360 && images360.unfocus());

let orientedImages = null;
button("Load oriented images (fixture)", async () => {
	if (orientedImages) {
		orientedImages.dispose();
		viewer.scene.removeOrientedImages(orientedImages);
		viewer.scene.scene.remove(orientedImages.node);
	}
	orientedImages = await OrientedImageLoader.load(
		"/fixtures/oriented-images/camera.xml",
		"/fixtures/oriented-images/images.txt",
		viewer
	);
	viewer.scene.addOrientedImages(orientedImages);
	orientedImages.controls.addEventListener("capture", logEvt("orientedImages"));
	orientedImages.controls.addEventListener("release", logEvt("orientedImages"));
	console.log("oriented images", orientedImages, "hover a plane to clip, click to fly into it");
	return { images: orientedImages.images.length };
});
button("Oriented: back to 3D", () => orientedImages && orientedImages.controls.release());

// --- load sample ---------------------------------------------------------
const dataset = {
	name: "lion_takanawa_ept_laz (EPT+LAZ/copc)",
	url: "/@fs/Users/juancuevas/Dev/potree-lib/.context/potree/pointclouds/lion_takanawa_ept_laz/ept.json",
};
status.textContent = `${dataset.name}: loading…`;

loadPointCloud(dataset.url, dataset.name, (e) => {
	const pointcloud = e.pointcloud;
	viewer.scene.addPointCloud(pointcloud);
	pointcloud.material.size = 1;
	pointcloud.material.pointSizeType = 2; // ADAPTIVE
	viewer.fitToScreen();
	status.textContent = `${dataset.name}: loaded — left-click to place markers, right-click to finish; watch the console`;
	console.log("loaded", dataset.name, pointcloud);
});

window.addEventListener("error", (e) => {
	status.textContent += `\nError: ${e.message}`;
	status.style.color = "#f66";
	console.error(e);
});
window.addEventListener("unhandledrejection", (e) => {
	status.textContent += `\nUnhandled rejection: ${e.reason}`;
	status.style.color = "#f66";
	console.error(e.reason);
});
