let ftCanvas = typeof document !== "undefined" ? document.createElement('canvas') : null;

/**
 * WebGL capability checks used to decide whether optional shader-based
 * render passes (EDL, splatting, quad interpolation) can run.
 */
export const Features = (function(){
	if(ftCanvas === null){
		return null;
	}

	let gl = ftCanvas.getContext('webgl');
	if(gl === null){
		return null;
	}

	// -- code taken from THREE.WebGLRenderer --
	let vertexHighp = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
	let vertexMediump = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT);
	let fragmentHighp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
	let fragmentMediump = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);

	let highpAvailable = vertexHighp.precision > 0 && fragmentHighp.precision > 0;
	let mediumpAvailable = vertexMediump.precision > 0 && fragmentMediump.precision > 0;
	// -----------------------------------------

	let precision;
	if(highpAvailable){
		precision = 'highp';
	}else if(mediumpAvailable){
		precision = 'mediump';
	}else{
		precision = 'lowp';
	}

	return {
		precision: precision,
		SHADER_INTERPOLATION: {
			isSupported: function(){
				let supported = true;

				supported = supported && Boolean(gl.getExtension('EXT_frag_depth'));
				supported = supported && gl.getParameter(gl.MAX_VARYING_VECTORS) >= 8;

				return supported;
			}
		},
		SHADER_SPLATS: {
			isSupported: function(){
				let supported = true;

				supported = supported && Boolean(gl.getExtension('EXT_frag_depth'));
				supported = supported && Boolean(gl.getExtension('OES_texture_float'));
				supported = supported && gl.getParameter(gl.MAX_VARYING_VECTORS) >= 8;

				return supported;
			}
		},
		SHADER_EDL: {
			isSupported: function(){
				let supported = true;

				supported = supported && Boolean(gl.getExtension('EXT_frag_depth'));
				supported = supported && Boolean(gl.getExtension('OES_texture_float'));
				supported = supported && gl.getParameter(gl.MAX_VARYING_VECTORS) >= 8;

				return supported;
			}
		},
	};
}());
