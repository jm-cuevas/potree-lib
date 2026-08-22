/**
 * adapted from THREE.DeviceOrientationControls by richt / http://richt.me, WestLangley / http://github.com/WestLangley
 */

import * as THREE from "three";
import {EventDispatcher} from "../core/EventDispatcher.js";

export class DeviceOrientationControls extends EventDispatcher{
	constructor(viewer){
		super();

		this.viewer = viewer;
		this.renderer = viewer.renderer;
		this.enabled = true;

		this.scene = null;
		this.sceneControls = new THREE.Scene();

		this.screenOrientation = window.orientation || 0;

		let deviceOrientationChange = e => {
			this.deviceOrientation = e;
		};

		let screenOrientationChange = e => {
			this.screenOrientation = window.orientation || 0;
		};

		const win = /** @type {any} */ (window);
		if('ondeviceorientationabsolute' in win){
			window.addEventListener('deviceorientationabsolute', deviceOrientationChange);
		}else if('ondeviceorientation' in win){
			window.addEventListener('deviceorientation', deviceOrientationChange);
		}else{
			console.warn("No device orientation found.");
		}
		window.addEventListener('orientationchange', screenOrientationChange);
	}

	setScene(scene){
		this.scene = scene;
	}

	update(delta){
		let computeQuaternion = function(alpha, beta, gamma, orient){
			let quaternion = new THREE.Quaternion();

			let zee = new THREE.Vector3(0, 0, 1);
			let euler = new THREE.Euler();
			let q0 = new THREE.Quaternion();

			euler.set(beta, gamma, alpha, 'ZXY');
			quaternion.setFromEuler(euler);
			quaternion.multiply(q0.setFromAxisAngle(zee, -orient));

			return quaternion;
		};

		if(typeof this.deviceOrientation !== 'undefined'){
			let alpha = this.deviceOrientation.alpha ? THREE.MathUtils.degToRad(this.deviceOrientation.alpha) : 0;
			let beta = this.deviceOrientation.beta ? THREE.MathUtils.degToRad(this.deviceOrientation.beta) : 0;
			let gamma = this.deviceOrientation.gamma ? THREE.MathUtils.degToRad(this.deviceOrientation.gamma) : 0;
			let orient = this.screenOrientation ? THREE.MathUtils.degToRad(this.screenOrientation) : 0;

			let quaternion = computeQuaternion(alpha, beta, gamma, orient);
			this.viewer.scene.cameraP.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
		}
	}
}
