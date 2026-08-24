// Dev harness for potree-lib. Phase 2 smoke test: creates a Viewer, then
// loads a real EPT+LAZ sample dataset (via the copc-backed EPT loader) to
// confirm the loader chain + octree LOD engine render real point data.
//
// The legacy "POC" octree format (BinaryLoader) isn't demoed here: its
// metadata file is conventionally named "cloud.js" despite being plain
// JSON, and Vite's dev middleware transforms any `.js`-extensioned request
// as an ES module (injecting an import-analysis + sourcemap comment),
// corrupting it for a plain fetch()/XHR - a dev-server-only quirk (real
// deployments serve it from a plain static host). BinaryLoader was verified
// by code review instead - see .memory/IMPLEMENTATION_PLAN.md Phase 2 notes.
import * as THREE from "three";
import {Viewer} from "../src/core/index.js";
import {loadPointCloud} from "../src/loaders/index.js";

console.log("potree-lib dev harness", {three: THREE.REVISION});

const app = document.getElementById("app");

const status = document.createElement("div");
status.style.cssText = "position:absolute;z-index:10;color:#eee;font:13px monospace;padding:0.75rem;pointer-events:none;text-shadow:0 1px 2px black;white-space:pre;";
status.textContent = "Phase 2 smoke test: creating Viewer…";
app.appendChild(status);

const viewer = new Viewer(app, {resourcePath: null});

viewer.setBackground("gradient");
viewer.scene.view.position.set(10, 10, 10);
viewer.scene.view.lookAt(new THREE.Vector3(0, 0, 0));

window.__viewer = viewer;

// Vite's dev server only serves files under its root (examples/) unless
// addressed via the `/@fs/<absolute-path>` prefix - the sample data lives
// outside the package entirely, at .context/potree/pointclouds/.
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

	status.textContent = `${dataset.name}: loaded`;
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
