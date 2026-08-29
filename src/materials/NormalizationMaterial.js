import * as THREE from "three";
import normalizeVertexShader from "./shaders/normalize.vs?raw";
import normalizeFragmentShader from "./shaders/normalize.fs?raw";

export class NormalizationMaterial extends THREE.RawShaderMaterial {

	constructor(parameters = {}) {
		super();

		// Shaders are GLSL ES 3.00 (WebGL2): three.js prepends `#version 300 es`
		// and compiles them as such. Source files carry no `#version` line.
		this.glslVersion = THREE.GLSL3;

		let uniforms = {
			uDepthMap:  {value: null},
			uWeightMap: {value: null},
		};

		this.setValues({
			uniforms: uniforms,
			vertexShader: this.getDefines() + normalizeVertexShader,
			fragmentShader: this.getDefines() + normalizeFragmentShader,
		});
	}

	getDefines() {
		return '';
	}

	updateShaderSource() {
		let vs = this.getDefines() + normalizeVertexShader;
		let fs = this.getDefines() + normalizeFragmentShader;

		this.setValues({
			vertexShader: vs,
			fragmentShader: fs,
		});

		this.needsUpdate = true;
	}

}
