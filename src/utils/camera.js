import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";

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
		let tween = new TWEEN.Tween(view.position).to(endPosition, animationDuration);
		tween.easing(easing);
		tween.start();
	}

	{ // animate camera target
		let camTargetDistance = camera.position.distanceTo(endTarget);
		let target = new THREE.Vector3().addVectors(
			camera.position,
			camera.getWorldDirection(new THREE.Vector3()).clone().multiplyScalar(camTargetDistance)
		);
		let tween = new TWEEN.Tween(target).to(endTarget, animationDuration);
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
