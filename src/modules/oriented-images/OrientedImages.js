import * as THREE from "three";
import {OrientedImageControls} from "./OrientedImageControls.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";
import {PolygonClipVolume} from "../../tools/clipping/PolygonClipVolume.js";

// https://support.pix4d.com/hc/en-us/articles/205675256-How-are-yaw-pitch-roll-defined
// https://support.pix4d.com/hc/en-us/articles/202558969-How-are-omega-phi-kappa-defined
//
// Headless port of Potree 1.8's `OrientedImages` module. The photo-overlay
// plane, the green frustum outline, hover highlighting and the click-to-fly
// behaviour are all kept. Hovering an image builds a `PolygonClipVolume` from
// the camera it was shot with so the point cloud is cut away in front of the
// photo. The only DOM the module touches is the render canvas (mousemove /
// mousedown) - the directional pan buttons live in `OrientedImageControls`
// and are dropped there; a real `loading.jpg` placeholder is only used when
// the viewer was given a `resourcePath`.

function createMaterial(){

	let vertexShader = `
	uniform float uNear;
	varying vec2 vUV;
	varying vec4 vDebug;

	void main(){
		vDebug = vec4(0.0, 1.0, 0.0, 1.0);
		vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
		// make sure that this mesh is at least in front of the near plane
		modelViewPosition.xyz += normalize(modelViewPosition.xyz) * uNear;
		gl_Position = projectionMatrix * modelViewPosition;
		vUV = uv;
	}
	`;

	let fragmentShader = `
	uniform sampler2D tColor;
	uniform float uOpacity;
	varying vec2 vUV;
	varying vec4 vDebug;
	void main(){
		vec4 color = texture2D(tColor, vUV);
		gl_FragColor = color;
		gl_FragColor.a = uOpacity;
	}
	`;
	const material = new THREE.ShaderMaterial({
		uniforms: {
			tColor: {value: new THREE.Texture()},
			uNear: {value: 0.0},
			uOpacity: {value: 1.0},
		},
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		side: THREE.DoubleSide,
	});

	return material;
}

const planeGeometry = new THREE.PlaneGeometry(1, 1);
const lineGeometry = new THREE.BufferGeometry().setFromPoints([
	new THREE.Vector3(-0.5, -0.5, 0),
	new THREE.Vector3( 0.5, -0.5, 0),
	new THREE.Vector3( 0.5,  0.5, 0),
	new THREE.Vector3(-0.5,  0.5, 0),
	new THREE.Vector3(-0.5, -0.5, 0),
]);

export class OrientedImage{

	constructor(id){

		this.id = id;
		this.fov = 1.0;
		this.position = new THREE.Vector3();
		this.rotation = new THREE.Vector3();
		this.width = 0;
		this.height = 0;

		const material = createMaterial();
		const lineMaterial = new THREE.LineBasicMaterial({color: 0x00ff00});
		this.mesh = new THREE.Mesh(planeGeometry, material);
		this.line = new THREE.Line(lineGeometry, lineMaterial);
		/** @type {THREE.Texture|null} */
		this.texture = null;

		/** @type {any} */ (this.mesh).orientedImage = this;
	}

	set(position, rotation, dimension, fov){

		let radians = rotation.map((d) => THREE.MathUtils.degToRad(d));

		this.position.set(position[0], position[1], position[2]);
		this.mesh.position.set(position[0], position[1], position[2]);

		this.rotation.set(radians[0], radians[1], radians[2]);
		this.mesh.rotation.set(radians[0], radians[1], radians[2]);

		[this.width, this.height] = dimension;
		this.mesh.scale.set(this.width / this.height, 1, 1);

		this.fov = fov;

		this.updateTransform();
	}

	updateTransform(){
		let {mesh, line, fov} = this;

		mesh.updateMatrixWorld();
		const dir = mesh.getWorldDirection(new THREE.Vector3());
		const alpha = THREE.MathUtils.degToRad(fov / 2);
		const d = -0.5 / Math.tan(alpha);
		const move = dir.clone().multiplyScalar(d);
		mesh.position.add(move);

		line.position.copy(mesh.position);
		line.scale.copy(mesh.scale);
		line.rotation.copy(mesh.rotation);
	}
}

export class OrientedImages extends EventDispatcher{

	constructor(){
		super();

		this.node = null;
		this.cameraParams = null;
		this.imageParams = null;
		/** @type {string|null} */
		this.cameraParamsPath = null;
		/** @type {string|null} */
		this.imageParamsPath = null;
		/** @type {OrientedImage[]|null} */
		this.images = null;
		/** @type {OrientedImageControls|null} */
		this.controls = null;
		/** @type {((image: OrientedImage) => void)|null} */
		this.moveToImage = null;
		this._visible = true;
		/** @type {(() => void)|null} */
		this._dispose = null;
	}

	set visible(visible){
		if(this._visible === visible){
			return;
		}

		for(const image of this.images){
			image.mesh.visible = visible;
			image.line.visible = visible;
		}

		this._visible = visible;
		this.dispatchEvent({
			type: "visibility_changed",
			images: this,
		});
	}

	get visible(){
		return this._visible;
	}

	/** Remove the canvas / viewer listeners this set installed. */
	dispose(){
		if(this._dispose){
			this._dispose();
			this._dispose = null;
		}
	}
}

export class OrientedImageLoader{

	static async loadCameraParams(path){
		const res = await fetch(path);
		const text = await res.text();

		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "application/xml");

		const width = parseInt(doc.getElementsByTagName("width")[0].textContent ?? "0");
		const height = parseInt(doc.getElementsByTagName("height")[0].textContent ?? "0");
		const f = parseFloat(doc.getElementsByTagName("f")[0].textContent ?? "0");

		let a = (height / 2) / f;
		let fov = 2 * THREE.MathUtils.radToDeg(Math.atan(a));

		const params = {
			path: path,
			width: width,
			height: height,
			f: f,
			fov: fov,
		};

		return params;
	}

	static async loadImageParams(path){

		const response = await fetch(path);
		if(!response.ok){
			console.error(`failed to load ${path}`);
			return [];
		}

		const content = await response.text();
		const lines = content.split(/\r?\n/);
		const imageParams = [];

		for(let i = 1; i < lines.length; i++){
			const line = lines[i];

			if(line.startsWith("#")){
				continue;
			}

			const tokens = line.split(/\s+/);

			if(tokens.length < 6){
				continue;
			}

			const params = {
				id: tokens[0],
				x: Number.parseFloat(tokens[1]),
				y: Number.parseFloat(tokens[2]),
				z: Number.parseFloat(tokens[3]),
				omega: Number.parseFloat(tokens[4]),
				phi: Number.parseFloat(tokens[5]),
				kappa: Number.parseFloat(tokens[6]),
			};

			imageParams.push(params);
		}

		return imageParams;
	}

	/**
	 * @param {string} cameraParamsPath camera-calibration XML
	 * @param {string} imageParamsPath  per-image position/orientation list
	 * @param {import("../../core/Viewer.js").Viewer} viewer
	 * @returns {Promise<OrientedImages>}
	 */
	static async load(cameraParamsPath, imageParamsPath, viewer){

		const [cameraParams, imageParams] = await Promise.all([
			OrientedImageLoader.loadCameraParams(cameraParamsPath),
			OrientedImageLoader.loadImageParams(imageParamsPath),
		]);

		const orientedImageControls = new OrientedImageControls(viewer);
		const raycaster = new THREE.Raycaster();

		const {width, height} = cameraParams;
		const orientedImages = [];
		const sceneNode = new THREE.Object3D();
		sceneNode.name = "oriented_images";

		for(const params of imageParams){

			const {x, y, z, omega, phi, kappa} = params;

			let orientedImage = new OrientedImage(params.id);
			let position = [x, y, z];
			let rotation = [omega, phi, kappa];
			let dimension = [width, height];
			orientedImage.set(position, rotation, dimension, cameraParams.fov);

			sceneNode.add(orientedImage.mesh);
			sceneNode.add(orientedImage.line);

			orientedImages.push(orientedImage);
		}

		/** @type {OrientedImage|null} */
		let hoveredElement = null;
		/** @type {PolygonClipVolume|null} */
		let clipVolume = null;

		const onMouseMove = (evt) => {
			if(hoveredElement){
				hoveredElement.line.material.color.setRGB(0, 1, 0);
			}
			evt.preventDefault();

			const rect = viewer.renderer.domElement.getBoundingClientRect();
			const [x, y] = [evt.clientX, evt.clientY];
			const array = [
				(x - rect.left) / rect.width,
				(y - rect.top) / rect.height
			];
			const onClickPosition = new THREE.Vector2(array[0], array[1]);
			const camera = viewer.scene.getActiveCamera();
			const mouse = new THREE.Vector2(
				+(onClickPosition.x * 2) - 1,
				-(onClickPosition.y * 2) + 1);
			const objects = orientedImages.map(i => i.mesh);
			raycaster.setFromCamera(mouse, camera);
			const intersects = raycaster.intersectObjects(objects);
			let selectionChanged = false;

			if(intersects.length > 0){
				const intersection = intersects[0];
				const orientedImage = /** @type {any} */ (intersection.object).orientedImage;
				orientedImage.line.material.color.setRGB(1, 0, 0);
				selectionChanged = hoveredElement !== orientedImage;
				hoveredElement = orientedImage;
			}else{
				hoveredElement = null;
			}

			let shouldAddClipVolume = clipVolume === null && hoveredElement !== null;

			if(clipVolume !== null && (hoveredElement === null || selectionChanged)){
				// remove existing
				viewer.scene.removePolygonClipVolume(clipVolume);
				clipVolume = null;
			}

			if(shouldAddClipVolume || selectionChanged){
				const img = hoveredElement;
				if(!img){
					return;
				}
				const fov = cameraParams.fov;
				const aspect = cameraParams.width / cameraParams.height;
				const near = 1.0;
				const far = 1000 * 1000;
				const clipCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
				clipCamera.rotation.order = viewer.scene.getActiveCamera().rotation.order;
				clipCamera.rotation.copy(img.mesh.rotation);
				{
					const mesh = img.mesh;
					const dir = mesh.getWorldDirection(new THREE.Vector3());
					const pos = mesh.position;
					const alpha = THREE.MathUtils.degToRad(fov / 2);
					const d = 0.5 / Math.tan(alpha);
					const newCamPos = pos.clone().add(dir.clone().multiplyScalar(d));
					clipCamera.position.copy(newCamPos);
				}
				let volume = new PolygonClipVolume(clipCamera);
				let m0 = new THREE.Mesh();
				let m1 = new THREE.Mesh();
				let m2 = new THREE.Mesh();
				let m3 = new THREE.Mesh();
				m0.position.set(-1, -1, 0);
				m1.position.set( 1, -1, 0);
				m2.position.set( 1,  1, 0);
				m3.position.set(-1,  1, 0);
				volume.markers.push(m0, m1, m2, m3);
				volume.initialized = true;

				viewer.scene.addPolygonClipVolume(volume);
				clipVolume = volume;
			}
		};

		const moveToImage = (image) => {

			const mesh = image.mesh;
			const newCamPos = image.position.clone();
			const newCamTarget = mesh.position.clone();

			viewer.scene.view.setView(newCamPos, newCamTarget, 500, () => {
				orientedImageControls.capture(image);
			});

			if(image.texture === null){

				const target = image;

				if(viewer.resourcePath){
					const tmpImagePath = `${viewer.resourcePath}/images/loading.jpg`;
					new THREE.TextureLoader().load(tmpImagePath,
						(texture) => {
							if(target.texture === null){
								target.texture = texture;
								target.mesh.material.uniforms.tColor.value = texture;
								mesh.material.needsUpdate = true;
							}
						}
					);
				}

				const imagePath = `${imageParamsPath}/../${target.id}`;
				new THREE.TextureLoader().load(imagePath,
					(texture) => {
						target.texture = texture;
						target.mesh.material.uniforms.tColor.value = texture;
						mesh.material.needsUpdate = true;
					}
				);
			}
		};

		const onMouseClick = (evt) => {

			if(orientedImageControls.hasSomethingCaptured()){
				return;
			}

			if(hoveredElement){
				moveToImage(hoveredElement);
			}
		};
		viewer.renderer.domElement.addEventListener('mousemove', onMouseMove, false);
		viewer.renderer.domElement.addEventListener('mousedown', onMouseClick, false);

		const onUpdate = () => {

			for(const image of orientedImages){
				const {width, height} = image;
				const aspect = width / height;

				const camera = viewer.scene.getActiveCamera();

				const imgPos = image.mesh.getWorldPosition(new THREE.Vector3());
				const camPos = camera.position;
				const d = camPos.distanceTo(imgPos);

				const minSize = 1; // in degrees of fov
				const a = THREE.MathUtils.degToRad(minSize);
				let r = d * Math.tan(a);
				r = Math.max(r, 1);

				image.mesh.scale.set(r * aspect, r, 1);
				image.line.scale.set(r * aspect, r, 1);

				image.mesh.material.uniforms.uNear.value = camera.near;
			}
		};
		viewer.addEventListener("update", onUpdate);

		const images = new OrientedImages();
		images.node = sceneNode;
		images.cameraParamsPath = cameraParamsPath;
		images.imageParamsPath = imageParamsPath;
		images.cameraParams = cameraParams;
		images.imageParams = imageParams;
		images.images = orientedImages;
		images.controls = orientedImageControls;
		images.moveToImage = moveToImage;
		images._dispose = () => {
			viewer.renderer.domElement.removeEventListener('mousemove', onMouseMove, false);
			viewer.renderer.domElement.removeEventListener('mousedown', onMouseClick, false);
			viewer.removeEventListener("update", onUpdate);
			if(clipVolume !== null){
				viewer.scene.removePolygonClipVolume(clipVolume);
				clipVolume = null;
			}
		};

		return images;
	}
}
