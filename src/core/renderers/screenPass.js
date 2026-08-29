import * as THREE from "three";

/**
 * Full-screen quad used by the EDL/normalization post-processing passes to
 * run a fragment shader over an entire render target.
 */
class ScreenPass {

	constructor() {
		this.screenScene = new THREE.Scene();
		this.screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1));
		const material = /** @type {THREE.Material} */ (this.screenQuad.material);
		material.depthTest = true;
		material.depthWrite = true;
		material.transparent = true;
		this.screenScene.add(this.screenQuad);
		this.camera = new THREE.Camera();
	}

	render(renderer, material, target) {
		this.screenQuad.material = material;

		if (target === undefined) {
			renderer.render(this.screenScene, this.camera);
		} else {
			renderer.render(this.screenScene, this.camera, target);
		}
	}

}

export const screenPass = new ScreenPass();
