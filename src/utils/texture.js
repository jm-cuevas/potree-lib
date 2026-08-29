import * as THREE from "three";

/**
 * Solid-color RGBA data texture, e.g. used as a placeholder before real
 * per-frame data (LOD visibility, gradients, ...) is written into it.
 *
 * @param {number} width
 * @param {number} height
 * @param {THREE.Color} color
 * @returns {THREE.DataTexture}
 */
export function generateDataTexture(width, height, color) {
	let size = width * height;
	let data = new Uint8Array(4 * size);

	let r = Math.floor(color.r * 255);
	let g = Math.floor(color.g * 255);
	let b = Math.floor(color.b * 255);

	for (let i = 0; i < size; i++) {
		data[i * 4] = r;
		data[i * 4 + 1] = g;
		data[i * 4 + 2] = b;
		data[i * 4 + 3] = 255;
	}

	let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
	texture.needsUpdate = true;
	texture.magFilter = THREE.NearestFilter;

	return texture;
}

/**
 * Subtle noise/vignette texture used as the "gradient" background scene.
 *
 * @param {number} width
 * @param {number} height
 * @returns {THREE.DataTexture}
 */
export function createBackgroundTexture(width, height){
	function gauss(x, y){
		return (1 / (2 * Math.PI)) * Math.exp(-(x * x + y * y) / 2);
	}

	let size = width * height;
	// RGBA, not RGB: WebGL2's texStorage2D (used internally by three.js for
	// DataTexture uploads) requires a sized format, and GL_RGB8 isn't one of
	// the color-renderable/texturable formats guaranteed there - GL_RGBA8 is.
	let data = new Uint8Array(4 * size);

	let chroma = [1, 1.5, 1.7];
	let max = gauss(0, 0);

	for(let x = 0; x < width; x++){
		for(let y = 0; y < height; y++){
			let u = 2 * (x / width) - 1;
			let v = 2 * (y / height) - 1;

			let i = x + width * y;
			let d = gauss(2 * u, 2 * v) / max;
			let r = (Math.random() + Math.random() + Math.random()) / 3;
			r = (d * 0.5 + 0.5) * r * 0.03;
			r = r * 0.4;

			data[4 * i + 0] = 255 * (d / 15 + 0.05 + r) * chroma[0];
			data[4 * i + 1] = 255 * (d / 15 + 0.05 + r) * chroma[1];
			data[4 * i + 2] = 255 * (d / 15 + 0.05 + r) * chroma[2];
			data[4 * i + 3] = 255;
		}
	}

	let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
	texture.needsUpdate = true;

	return texture;
}

/**
 * Loads a 6-image cubemap skybox from `path` (expects px/nx/py/ny/pz/nz.jpg files).
 *
 * @param {string} path
 * @returns {{camera: THREE.PerspectiveCamera, scene: THREE.Scene, parent: THREE.Object3D}}
 */
export function loadSkybox(path){
	let parent = new THREE.Object3D();
	parent.name = "skybox_root";

	let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100000);
	camera.up.set(0, 0, 1);
	let scene = new THREE.Scene();

	let format = '.jpg';
	let urls = [
		path + 'px' + format, path + 'nx' + format,
		path + 'py' + format, path + 'ny' + format,
		path + 'pz' + format, path + 'nz' + format
	];

	let materialArray = [];
	for(let i = 0; i < 6; i++){
		let material = new THREE.MeshBasicMaterial({
			map: null,
			side: THREE.BackSide,
			depthTest: false,
			depthWrite: false,
			color: 0x424556
		});

		materialArray.push(material);

		let loader = new THREE.TextureLoader();
		loader.load(urls[i],
			function loaded(texture){
				material.map = texture;
				material.needsUpdate = true;
				material.color.setHex(0xffffff);
			}, undefined, function error(xhr){
				console.log('An error happened', xhr);
			}
		);
	}

	let skyGeometry = new THREE.BoxGeometry(700, 700, 700);
	let skybox = new THREE.Mesh(skyGeometry, materialArray);

	scene.add(skybox);

	scene.traverse(n => n.frustumCulled = false);

	// z up
	scene.rotation.x = Math.PI / 2;

	parent.children.push(camera);
	camera.parent = parent;

	return {camera, scene, parent};
}

/**
 * Renders an RGBA pixel buffer (as read back from a render target) into an
 * `<img>` element, forcing alpha to 255.
 *
 * @param {ArrayLike<number>} pixels
 * @param {number} width
 * @param {number} height
 * @returns {HTMLImageElement}
 */
export function pixelsArrayToImage(pixels, width, height){
	let img = new Image();
	img.src = pixelsArrayToDataUrl(pixels, width, height);

	return img;
}

/**
 * Renders an RGBA pixel buffer into a `data:` URL (PNG), forcing alpha to 255.
 *
 * @param {ArrayLike<number>} pixels
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function pixelsArrayToDataUrl(pixels, width, height){
	let canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	let context = canvas.getContext("2d");

	let copy = Uint8ClampedArray.from(pixels);
	for(let i = 0; i < copy.length; i++){
		copy[i * 4 + 3] = 255;
	}

	let imageData = context.createImageData(width, height);
	imageData.data.set(copy);
	context.putImageData(imageData, 0, 0);

	return canvas.toDataURL();
}

/**
 * Renders an RGBA pixel buffer into a `<canvas>`, flipped vertically (render
 * targets are bottom-up, images are top-down).
 *
 * @param {ArrayLike<number>} pixels
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function pixelsArrayToCanvas(pixels, width, height){
	let canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	let context = canvas.getContext("2d");

	let copy = Uint8ClampedArray.from(pixels);

	// flip vertically
	let bytesPerLine = width * 4;
	for(let i = 0; i < Math.trunc(height / 2); i++){
		let j = height - i - 1;

		let lineI = copy.slice(i * bytesPerLine, i * bytesPerLine + bytesPerLine);
		let lineJ = copy.slice(j * bytesPerLine, j * bytesPerLine + bytesPerLine);
		copy.set(lineJ, i * bytesPerLine);
		copy.set(lineI, j * bytesPerLine);
	}

	let imageData = context.createImageData(width, height);
	imageData.data.set(copy);
	context.putImageData(imageData, 0, 0);

	return canvas;
}

/**
 * Builds an `<svg>` element showing `scheme` as a vertical gradient swatch.
 * Used by consuming UIs to render a gradient legend; kept here since it's the
 * only non-DOM-free helper that pairs with `materials/Gradients.js`.
 *
 * @param {Array<[number, THREE.Color]>} scheme - list of [offset 0..1, color] stops
 * @returns {SVGSVGElement}
 */
export function createSvgGradient(scheme){
	const gradientId = `${Math.random()}_${Date.now()}`;

	const svgn = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgn, "svg");
	svg.setAttributeNS(null, "width", "2em");
	svg.setAttributeNS(null, "height", "3em");

	{ // <defs>
		const defs = document.createElementNS(svgn, "defs");

		const linearGradient = document.createElementNS(svgn, "linearGradient");
		linearGradient.setAttributeNS(null, "id", gradientId);
		linearGradient.setAttributeNS(null, "gradientTransform", "rotate(90)");

		for(let i = scheme.length - 1; i >= 0; i--){
			const stopVal = scheme[i];
			const percent = Math.round(100 - stopVal[0] * 100);
			const [r, g, b] = stopVal[1].toArray().map(v => Math.round(v * 255));

			const stop = document.createElementNS(svgn, "stop");
			stop.setAttributeNS(null, "offset", `${percent}%`);
			stop.setAttributeNS(null, "stop-color", `rgb(${r}, ${g}, ${b})`);

			linearGradient.appendChild(stop);
		}

		defs.appendChild(linearGradient);
		svg.appendChild(defs);
	}

	const rect = document.createElementNS(svgn, "rect");
	rect.setAttributeNS(null, "width", "100%");
	rect.setAttributeNS(null, "height", "100%");
	rect.setAttributeNS(null, "fill", `url("#${gradientId}")`);
	rect.setAttributeNS(null, "stroke", "black");
	rect.setAttributeNS(null, "stroke-width", "0.1em");

	svg.appendChild(rect);

	return svg;
}
