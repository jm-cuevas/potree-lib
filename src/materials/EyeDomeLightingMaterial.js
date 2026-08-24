import * as THREE from "three";
import edlVertexShader from "./shaders/edl.vs?raw";
import edlFragmentShader from "./shaders/edl.fs?raw";

//
// Algorithm by Christian Boucheny
// shader code taken and adapted from CloudCompare
//
// see
// https://github.com/cloudcompare/trunk/tree/master/plugins/qEDL/shaders/EDL
// http://www.kitware.com/source/home/post/9
// https://tel.archives-ouvertes.fr/tel-00438464/document p. 115+ (french)

export class EyeDomeLightingMaterial extends THREE.RawShaderMaterial {

	constructor(parameters = {}) {
		super();

		let uniforms = {
			screenWidth:  {value: 0},
			screenHeight: {value: 0},
			edlStrength:  {value: 1.0},
			uNear:        {value: 1.0},
			uFar:         {value: 1.0},
			radius:       {value: 1.0},
			neighbours:   {value: []},
			depthMap:     {value: null},
			uEDLColor:    {value: null},
			uEDLDepth:    {value: null},
			opacity:      {value: 1.0},
			uProj:        {value: []},
		};

		this.setValues({
			uniforms: uniforms,
			vertexShader: this.getDefines() + edlVertexShader,
			fragmentShader: this.getDefines() + edlFragmentShader,
			lights: false,
		});

		this.neighbourCount = 8;
	}

	getDefines() {
		let defines = '';

		defines += '#define NEIGHBOUR_COUNT ' + this.neighbourCount + '\n';

		return defines;
	}

	updateShaderSource() {
		let vs = this.getDefines() + edlVertexShader;
		let fs = this.getDefines() + edlFragmentShader;

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
