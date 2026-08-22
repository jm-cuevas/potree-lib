// Dev harness for potree-lib. Phase 1 smoke test: creates a Viewer on a
// plain canvas-hosting div, confirms it renders an empty scene with orbit
// controls responding to mouse input, and that no console errors occur.
import * as THREE from "three";
import {Viewer} from "../src/core/index.js";

console.log("potree-lib dev harness", {three: THREE.REVISION});

const app = document.getElementById("app");

const status = document.createElement("div");
status.style.cssText = "position:absolute;z-index:10;color:#eee;font:13px monospace;padding:0.75rem;pointer-events:none;text-shadow:0 1px 2px black;";
status.textContent = "Phase 1 smoke test: creating Viewer…";
app.appendChild(status);

const viewer = new Viewer(app, {resourcePath: null});

viewer.setBackground("gradient");
viewer.scene.view.position.set(10, 10, 10);
viewer.scene.view.lookAt(new THREE.Vector3(0, 0, 0));

// A visible reference object so orbiting/panning is easy to eyeball even
// with no point cloud loaded yet (loaders land in Phase 2).
const box = new THREE.Mesh(
	new THREE.BoxGeometry(2, 2, 2),
	new THREE.MeshNormalMaterial()
);
viewer.scene.scene.add(box);

let frames = 0;
viewer.addEventListener("update", () => {
	frames++;
	if(frames === 1){
		status.textContent = "Viewer created, render loop running. Drag to orbit, scroll to zoom.";
	}
});

window.addEventListener("error", (e) => {
	status.textContent = `Error: ${e.message}`;
	status.style.color = "#f66";
});

window.__viewer = viewer;
