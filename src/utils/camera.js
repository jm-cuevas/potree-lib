import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import {tweens} from "./tweens.js";
import {zoomTo} from "../core/camera-utils.js";

/**
 * Tweens the active view's position and look-at target.
 *
 * @param {import("../core/Scene.js").Scene} scene
 * @param {THREE.Vector3} endPosition
 * @param {THREE.Vector3} endTarget
 */
export function moveTo(scene, endPosition, endTarget){
	let view = scene.view;
	let camera = scene.getActiveCamera();
	let animationDuration = 500;
	let easing = TWEEN.Easing.Quartic.Out;

	{ // animate camera position
		let tween = new TWEEN.Tween(view.position, tweens).to(endPosition, animationDuration);
		tween.easing(easing);
		tween.start();
	}

	{ // animate camera target
		let camTargetDistance = camera.position.distanceTo(endTarget);
		let target = new THREE.Vector3().addVectors(
			camera.position,
			camera.getWorldDirection(new THREE.Vector3()).clone().multiplyScalar(camTargetDistance)
		);
		let tween = new TWEEN.Tween(target, tweens).to(endTarget, animationDuration);
		tween.easing(easing);
		tween.onUpdate(() => {
			view.lookAt(target);
		});
		tween.onComplete(() => {
			view.lookAt(target);
		});
		tween.start();
	}
}

/**
 * Snaps `camera` to look straight down the -Y axis at `node`, then frames it.
 *
 * @param {THREE.PerspectiveCamera | THREE.OrthographicCamera} camera
 * @param {*} node - anything `zoomTo` accepts (boundingSphere/boundingBox/geometry)
 */
export function topView(camera, node){
	camera.position.set(0, 1, 0);
	camera.rotation.set(-Math.PI / 2, 0, 0);
	zoomTo(camera, node, 1);
}

/**
 * Snaps `camera` to look down the -Z axis at `node`, then frames it.
 *
 * @param {THREE.PerspectiveCamera | THREE.OrthographicCamera} camera
 * @param {*} node
 */
export function frontView(camera, node){
	camera.position.set(0, 0, 1);
	camera.rotation.set(0, 0, 0);
	zoomTo(camera, node, 1);
}

/**
 * Snaps `camera` to look down the +X axis at `node`, then frames it.
 *
 * @param {THREE.PerspectiveCamera | THREE.OrthographicCamera} camera
 * @param {*} node
 */
export function leftView(camera, node){
	camera.position.set(-1, 0, 0);
	camera.rotation.set(0, -Math.PI / 2, 0);
	zoomTo(camera, node, 1);
}

/**
 * Snaps `camera` to look down the -X axis at `node`, then frames it.
 *
 * @param {THREE.PerspectiveCamera | THREE.OrthographicCamera} camera
 * @param {*} node
 */
export function rightView(camera, node){
	camera.position.set(1, 0, 0);
	camera.rotation.set(0, Math.PI / 2, 0);
	zoomTo(camera, node, 1);
}
