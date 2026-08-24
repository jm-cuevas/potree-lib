import * as THREE from "three";
import normalizeVertexShader from "./shaders/normalize.vs?raw";
import normalizeFragmentShader from "./shaders/normalize.fs?raw";

export class NormalizationMaterial extends THREE.RawShaderMaterial {

	constructor(parameters = {}) {
		super();

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
