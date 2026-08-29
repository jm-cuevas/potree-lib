import * as THREE from "three";
import {EventDispatcher} from "../../core/EventDispatcher.js";

/**
 * Pan / zoom-within-a-photo controls used once an oriented image is captured.
 *
 * Headless port: the upstream module built five jQuery `<input type=button>`
 * arrows (up / right / down / left / "Back to 3D view") and appended them over
 * the canvas. Those are dropped. The shear-camera math that actually does the
 * panning and fov zoom is kept intact and exposed as:
 *   - `pan(dx, dy)`  - nudge the view inside the photo (dx/dy in fractions of
 *                      the current vertical fov; matches the old ±0.1 arrows)
 *   - `zoom(delta)`  - queue an fov change (also driven by the wheel)
 *   - `release()`    - go back to the 3D view (the old "exit" button)
 * A consuming app renders whatever buttons it wants and calls these.
 */
export class OrientedImageControls extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;
		this.renderer = viewer.renderer;

		this.originalCam = viewer.scene.getActiveCamera();
		this.shearCam = viewer.scene.getActiveCamera().clone();
		{
			const r = this.originalCam.rotation;
			this.shearCam.rotation.set(r.x, r.y, r.z, r.order);
		}
		this.shearCam.updateProjectionMatrix();
		// neutralise updateProjectionMatrix so our manually sheared matrix survives
		this.shearCam.updateProjectionMatrix = () => {};

		/** @type {import("./OrientedImages.js").OrientedImage|null} */
		this.image = null;

		this.fadeFactor = 20;
		this.fovDelta = 0;

		this.fovMin = 0.1;
		this.fovMax = 120;

		this.shear = [0, 0];

		this.originalFOV = viewer.getFOV();
		this.originalControls = null;

		this.scene = null;
		this.sceneControls = new THREE.Scene();

		let scroll = (e) => {
			this.fovDelta += -e.delta * 1.0;
		};

		this.addEventListener('mousewheel', scroll);
	}

	hasSomethingCaptured(){
		return this.image !== null;
	}

	/**
	 * Nudge the view within the captured photo.
	 * @param {number} dx fraction of the vertical fov to pan horizontally
	 * @param {number} dy fraction of the vertical fov to pan vertically
	 */
	pan(dx, dy){
		const fovY = this.viewer.getFOV();
		const top = Math.tan(THREE.MathUtils.degToRad(fovY / 2));
		this.shear[0] += dx * top;
		this.shear[1] += dy * top;
	}

	/** Queue an fov delta (same units the mouse wheel feeds in). */
	zoom(delta){
		this.fovDelta += delta;
	}

	capture(image){
		if(this.hasSomethingCaptured()){
			return;
		}

		this.image = image;

		this.originalFOV = this.viewer.getFOV();
		this.originalControls = this.viewer.getControls();

		this.viewer.setControls(this);
		this.viewer.scene.overrideCamera = this.shearCam;

		this.shear = [0, 0];

		this.dispatchEvent({type: "capture", image});
	}

	release(){
		const image = this.image;
		this.image = null;

		this.viewer.scene.overrideCamera = null;

		this.viewer.setFOV(this.originalFOV);
		this.viewer.setControls(this.originalControls);

		this.dispatchEvent({type: "release", image});
	}

	setScene(scene){
		this.scene = scene;
	}

	update(delta){

		const progression = 1;
		const attenuation = 0;

		const oldFov = this.viewer.getFOV();
		let fovProgression = progression * this.fovDelta;
		let newFov = oldFov * ((1 + fovProgression / 10));

		newFov = Math.max(this.fovMin, newFov);
		newFov = Math.min(this.fovMax, newFov);

		let diff = newFov / oldFov;

		const mouse = this.viewer.inputHandler.mouse;
		const canvasSize = this.viewer.renderer.getSize(new THREE.Vector2());
		const uv = [
			(mouse.x / canvasSize.x),
			((canvasSize.y - mouse.y) / canvasSize.y)
		];

		const fovY = newFov;
		const aspect = canvasSize.x / canvasSize.y;
		const top = Math.tan(THREE.MathUtils.degToRad(fovY / 2));
		const height = 2 * top;
		const width = aspect * height;

		const shearRangeX = [
			this.shear[0] - 0.5 * width,
			this.shear[0] + 0.5 * width,
		];

		const shearRangeY = [
			this.shear[1] - 0.5 * height,
			this.shear[1] + 0.5 * height,
		];

		const shx = (1 - uv[0]) * shearRangeX[0] + uv[0] * shearRangeX[1];
		const shy = (1 - uv[1]) * shearRangeY[0] + uv[1] * shearRangeY[1];

		const shu = (1 - diff);

		const newShear = [
			(1 - shu) * this.shear[0] + shu * shx,
			(1 - shu) * this.shear[1] + shu * shy,
		];

		this.shear = newShear;
		this.viewer.setFOV(newFov);

		const {originalCam, shearCam} = this;

		originalCam.fov = newFov;
		originalCam.updateMatrixWorld();
		originalCam.updateProjectionMatrix();
		shearCam.copy(originalCam);
		{
			const r = originalCam.rotation;
			shearCam.rotation.set(r.x, r.y, r.z, r.order);
		}

		shearCam.updateMatrixWorld();
		shearCam.projectionMatrix.copy(originalCam.projectionMatrix);

		const [sx, sy] = this.shear;
		const mShear = new THREE.Matrix4().set(
			1, 0, sx, 0,
			0, 1, sy, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		);

		const proj = shearCam.projectionMatrix;
		proj.multiply(mShear);
		shearCam.projectionMatrixInverse.copy(proj).invert();

		this.fovDelta *= attenuation;
	}
}
