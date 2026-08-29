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
group("Clip");
button("Clip Volume", () => viewer.volumeTool.startInsertion({ clip: true }));
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

select("Clip task", [["NONE", ClipTask.NONE], ["HIGHLIGHT", ClipTask.HIGHLIGHT], ["SHOW_INSIDE", ClipTask.SHOW_INSIDE], ["SHOW_OUTSIDE", ClipTask.SHOW_OUTSIDE]], (v) => viewer.setClipTask(v)).value = String(ClipTask.HIGHLIGHT);
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
