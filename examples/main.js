// Dev harness for potree-lib. Currently a placeholder: the core module has no
// exports yet (Phase 1 adds Viewer/Scene). This just proves the dev server,
// three.js peer dependency, and subpath modules resolve correctly.
import * as THREE from "three";
import * as core from "../src/core/index.js";

console.log("potree-lib dev harness", { three: THREE.REVISION, core });

const app = document.getElementById("app");
const p = document.createElement("p");
p.style.cssText = "color:#eee;font:14px monospace;padding:1rem;";
p.textContent = `three.js r${THREE.REVISION} loaded. potree-lib core module resolved (empty — Phase 1 not started).`;
app.appendChild(p);
