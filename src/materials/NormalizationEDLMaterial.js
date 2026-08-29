import * as THREE from "three";
import normalizeVertexShader from "./shaders/normalize.vs?raw";
import normalizeAndEdlFragmentShader from "./shaders/normalize_and_edl.fs?raw";

export class NormalizationEDLMaterial extends THREE.RawShaderMaterial {

	constructor(parameters = {}) {
		super();

		// Shaders are GLSL ES 3.00 (WebGL2): three.js prepends `#version 300 es`
		// and compiles them as such. Source files carry no `#version` line.
		this.glslVersion = THREE.GLSL3;

		let uniforms = {
			screenWidth:  {value: 0},
			screenHeight: {value: 0},
			edlStrength:  {value: 1.0},
			radius:       {value: 1.0},
			neighbours:   {value: []},
			uEDLMap:      {value: null},
			uDepthMap:    {value: null},
			uWeightMap:   {value: null},
		};

		this.setValues({
			uniforms: uniforms,
			vertexShader: this.getDefines() + normalizeVertexShader,
			fragmentShader: this.getDefines() + normalizeAndEdlFragmentShader,
		});

		this.neighbourCount = 8;
	}

	getDefines() {
		let defines = '';

		defines += '#define NEIGHBOUR_COUNT ' + this.neighbourCount + '\n';

		return defines;
	}

	updateShaderSource() {
		let vs = this.getDefines() + normalizeVertexShader;
		let fs = this.getDefines() + normalizeAndEdlFragmentShader;

		this.setValues({
			vertexShader: vs,
			fragmentShader: fs,
		});

		this.uniforms.neighbours.value = this.neighbours;

		this.needsUpdate = true;
	}

	get neighbourCount() {
		return this._neighbourCount;
	}

	set neighbourCount(value) {
		if (this._neighbourCount !== value) {
			this._neighbourCount = value;
			this.neighbours = new Float32Array(this._neighbourCount * 2);
			for (let c = 0; c < this._neighbourCount; c++) {
				this.neighbours[2 * c + 0] = Math.cos(2 * c * Math.PI / this._neighbourCount);
				this.neighbours[2 * c + 1] = Math.sin(2 * c * Math.PI / this._neighbourCount);
			}

			this.updateShaderSource();
		}
	}

}
