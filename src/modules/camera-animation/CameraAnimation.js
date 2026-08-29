import * as THREE from "three";
import {EventDispatcher} from "../../core/EventDispatcher.js";
import {computeAzimuth} from "../../utils/geo.js";
import {Line2} from "three/examples/jsm/lines/Line2.js";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry.js";
import {LineMaterial} from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Camera fly-through animation: an ordered list of `ControlPoint`s (each a
 * camera position + look-at target), interpolated with two Catmull-Rom
 * splines. `at(t)` returns the `{position, target}` frame at `t in [0, 1]`;
 * `play()` runs the animation for `duration` seconds by driving
 * `viewer.scene.view` each frame.
 *
 * Headless port of Potree 1.8's `CameraAnimation`. The green/blue path lines
 * and the red frustum gizmo are kept (they render into the scene). The
 * upstream raw-SVG draggable handle editor is dropped - a consuming app that
 * wants an editor listens for `controlpoint_added` / `controlpoint_removed`,
 * mutates `cp.position` / `cp.target` directly, and reads `at(t)` to preview.
 */

export class ControlPoint{

	constructor(){
		this.position = new THREE.Vector3(0, 0, 0);
		this.target = new THREE.Vector3(0, 0, 0);
	}
}

export class CameraAnimation extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;

		/** @type {ControlPoint[]} */
		this.controlPoints = [];

		this.uuid = THREE.MathUtils.generateUUID();

		this.node = new THREE.Object3D();
		this.node.name = "camera animation";
		this.viewer.scene.scene.add(this.node);

		this.frustum = this.createFrustum();
		this.node.add(this.frustum);

		this.name = "Camera Animation";
		this.duration = 5;
		this.t = 0;
		/** @type {"centripetal" | "chordal" | "catmullrom"} */
		this.curveType = "centripetal";
		this.visible = true;

		/** @type {THREE.CatmullRomCurve3|null} */
		this.cameraCurve = null;
		/** @type {THREE.CatmullRomCurve3|null} */
		this.targetCurve = null;

		this._onUpdate = null;

		this.createUpdateHook();
		this.createPath();
	}

	static defaultFromView(viewer){
		const animation = new CameraAnimation(viewer);

		const camera = viewer.scene.getActiveCamera();
		const target = viewer.scene.view.getPivot();

		const cpCenter = new THREE.Vector3(
			0.3 * camera.position.x + 0.7 * target.x,
			0.3 * camera.position.y + 0.7 * target.y,
			0.3 * camera.position.z + 0.7 * target.z,
		);

		const targetCenter = new THREE.Vector3(
			0.05 * camera.position.x + 0.95 * target.x,
			0.05 * camera.position.y + 0.95 * target.y,
			0.05 * camera.position.z + 0.95 * target.z,
		);

		const r = camera.position.distanceTo(target) * 0.3;

		const angle = computeAzimuth(camera.position, target);

		const n = 5;
		for(let i = 0; i < n; i++){
			let u = 1.5 * Math.PI * (i / n) + angle;

			const dx = r * Math.cos(u);
			const dy = r * Math.sin(u);

			const cpPos = [
				cpCenter.x + dx,
				cpCenter.y + dy,
				cpCenter.z,
			];

			const targetPos = [
				targetCenter.x + dx * 0.1,
				targetCenter.y + dy * 0.1,
				targetCenter.z,
			];

			const cp = animation.createControlPoint();
			cp.position.set(cpPos[0], cpPos[1], cpPos[2]);
			cp.target.set(targetPos[0], targetPos[1], targetPos[2]);
		}

		return animation;
	}

	createUpdateHook(){
		const viewer = this.viewer;

		this._onUpdate = () => {

			const {width, height} = viewer.renderer.getSize(new THREE.Vector2());

			this.node.visible = this.visible;

			this.line.material.resolution.set(width, height);

			this.updatePath();

			{ // frustum
				const frame = this.at(this.t);
				const frustum = this.frustum;

				frustum.position.copy(frame.position);
				frustum.lookAt(frame.target.x, frame.target.y, frame.target.z);
				frustum.scale.set(20, 20, 20);

				frustum.material.resolution.set(width, height);
			}
		};

		viewer.addEventListener("update", this._onUpdate);
	}

	/** Detach the per-frame update hook. Call before discarding the animation. */
	dispose(){
		if(this._onUpdate){
			this.viewer.removeEventListener("update", this._onUpdate);
			this._onUpdate = null;
		}
	}

	createControlPoint(index){

		if(index === undefined){
			index = this.controlPoints.length;
		}

		const cp = new ControlPoint();

		if(this.controlPoints.length >= 2 && index === 0){
			const cp1 = this.controlPoints[0];
			const cp2 = this.controlPoints[1];

			const dir = cp1.position.clone().sub(cp2.position).multiplyScalar(0.5);
			cp.position.copy(cp1.position).add(dir);

			const tDir = cp1.target.clone().sub(cp2.target).multiplyScalar(0.5);
			cp.target.copy(cp1.target).add(tDir);
		}else if(this.controlPoints.length >= 2 && index === this.controlPoints.length){
			const cp1 = this.controlPoints[this.controlPoints.length - 2];
			const cp2 = this.controlPoints[this.controlPoints.length - 1];

			const dir = cp2.position.clone().sub(cp1.position).multiplyScalar(0.5);
			cp.position.copy(cp1.position).add(dir);

			const tDir = cp2.target.clone().sub(cp1.target).multiplyScalar(0.5);
			cp.target.copy(cp2.target).add(tDir);
		}else if(this.controlPoints.length >= 2){
			const cp1 = this.controlPoints[index - 1];
			const cp2 = this.controlPoints[index];

			cp.position.copy(cp1.position.clone().add(cp2.position).multiplyScalar(0.5));
			cp.target.copy(cp1.target.clone().add(cp2.target).multiplyScalar(0.5));
		}

		this.controlPoints.splice(index, 0, cp);

		this.dispatchEvent({
			type: "controlpoint_added",
			controlpoint: cp,
		});

		return cp;
	}

	removeControlPoint(cp){
		this.controlPoints = this.controlPoints.filter(_cp => _cp !== cp);

		this.dispatchEvent({
			type: "controlpoint_removed",
			controlpoint: cp,
		});
	}

	createPath(){

		{ // position
			const geometry = new LineGeometry();

			let material = new LineMaterial({
				color: 0x00ff00,
				dashSize: 5,
				gapSize: 2,
				linewidth: 2,
				resolution: new THREE.Vector2(1000, 1000),
			});

			const line = new Line2(geometry, material);

			this.line = line;
			this.node.add(line);
		}

		{ // target
			const geometry = new LineGeometry();

			let material = new LineMaterial({
				color: 0x0000ff,
				dashSize: 5,
				gapSize: 2,
				linewidth: 2,
				resolution: new THREE.Vector2(1000, 1000),
			});

			const line = new Line2(geometry, material);

			this.targetLine = line;
			this.node.add(line);
		}
	}

	createFrustum(){

		const f = 0.3;

		const positions = [
			 0,  0,  0,
			-f, -f, +1,

			 0,  0,  0,
			 f, -f, +1,

			 0,  0,  0,
			 f,  f, +1,

			 0,  0,  0,
			-f,  f, +1,

			-f, -f, +1,
			 f, -f, +1,

			 f, -f, +1,
			 f,  f, +1,

			 f,  f, +1,
			-f,  f, +1,

			-f,  f, +1,
			-f, -f, +1,
		];

		const geometry = new LineGeometry();

		geometry.setPositions(positions);
		geometry.computeBoundingSphere();

		let material = new LineMaterial({
			color: 0xff0000,
			linewidth: 2,
			resolution: new THREE.Vector2(1000, 1000),
		});

		const line = new Line2(geometry, material);
		line.computeLineDistances();

		return line;
	}

	updatePath(){

		{ // positions
			const positions = this.controlPoints.map(cp => cp.position);
			const first = positions[0];

			const curve = new THREE.CatmullRomCurve3(positions);
			curve.curveType = this.curveType;

			const n = 100;

			const curvePositions = [];
			for(let k = 0; k <= n; k++){
				const t = k / n;

				const position = curve.getPoint(t).sub(first);

				curvePositions.push(position.x, position.y, position.z);
			}

			this.line.geometry.setPositions(curvePositions);
			this.line.geometry.computeBoundingSphere();
			this.line.position.copy(first);
			this.line.computeLineDistances();

			this.cameraCurve = curve;
		}

		{ // targets
			const positions = this.controlPoints.map(cp => cp.target);
			const first = positions[0];

			const curve = new THREE.CatmullRomCurve3(positions);
			curve.curveType = this.curveType;

			const n = 100;

			const curvePositions = [];
			for(let k = 0; k <= n; k++){
				const t = k / n;

				const position = curve.getPoint(t).sub(first);

				curvePositions.push(position.x, position.y, position.z);
			}

			this.targetLine.geometry.setPositions(curvePositions);
			this.targetLine.geometry.computeBoundingSphere();
			this.targetLine.position.copy(first);
			this.targetLine.computeLineDistances();

			this.targetCurve = curve;
		}
	}

	at(t){

		if(t > 1){
			t = 1;
		}else if(t < 0){
			t = 0;
		}

		const camPos = this.cameraCurve.getPointAt(t);
		const target = this.targetCurve.getPointAt(t);

		const frame = {
			position: camPos,
			target: target,
		};

		return frame;
	}

	set(t){
		this.t = t;
	}

	setVisible(visible){
		this.node.visible = visible;
		this.visible = visible;
	}

	setDuration(duration){
		this.duration = duration;
	}

	getDuration(){
		return this.duration;
	}

	play(){

		const tStart = performance.now();
		const duration = this.duration;

		const originalyVisible = this.visible;
		this.setVisible(false);

		const onUpdate = (delta) => {

			let tNow = performance.now();
			let elapsed = (tNow - tStart) / 1000;
			let t = elapsed / duration;

			this.set(t);

			const frame = this.at(t);

			this.viewer.scene.view.position.copy(frame.position);
			this.viewer.scene.view.lookAt(frame.target);

			if(t > 1){
				this.setVisible(originalyVisible);

				this.viewer.removeEventListener("update", onUpdate);
			}
		};

		this.viewer.addEventListener("update", onUpdate);
	}
}
