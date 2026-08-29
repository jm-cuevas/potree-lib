import * as THREE from "three";
import {EventDispatcher} from "../../core/EventDispatcher.js";
import {mouseToRay} from "../../utils/geometry.js";

/**
 * 360° panorama image set.
 *
 * Headless port of Potree 1.8's `Images360` module. Each capture point is a
 * small semi-transparent sphere in the scene; clicking one flies the camera
 * to that point and wraps a high-resolution equirectangular texture around a
 * large inward-facing sphere. Focusing / unfocusing is fully in-engine - the
 * only DOM the upstream module carried was a single raw "unfocus" button,
 * which is dropped here. A consuming app wires its own control by calling
 * `unfocus()` and can listen for the `focus` / `unfocus` events.
 */

let sg = new THREE.SphereGeometry(1, 8, 8);
let sgHigh = new THREE.SphereGeometry(1, 128, 128);

let sm = new THREE.MeshBasicMaterial({side: THREE.BackSide});
let smHovered = new THREE.MeshBasicMaterial({side: THREE.BackSide, color: 0xff0000});

let raycaster = new THREE.Raycaster();
let currentlyHovered = null;

let previousView = {
	controls: null,
	position: null,
	target: null,
};

export class Image360{

	constructor(file, time, longitude, latitude, altitude, course, pitch, roll){
		this.file = file;
		this.time = time;
		this.longitude = longitude;
		this.latitude = latitude;
		this.altitude = altitude;
		this.course = course;
		this.pitch = pitch;
		this.roll = roll;
		/** @type {THREE.Mesh|null} */
		this.mesh = null;
		/** @type {number[]} projected [x, y, z] scene position */
		this.position = [0, 0, 0];
		/** @type {THREE.Texture|null} */
		this.texture = null;
	}
}

export class Images360 extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;

		this.selectingEnabled = true;

		/** @type {Image360[]} */
		this.images = [];
		this.node = new THREE.Object3D();

		this.sphere = new THREE.Mesh(sgHigh, sm);
		this.sphere.visible = false;
		this.sphere.scale.set(1000, 1000, 1000);
		this.node.add(this.sphere);
		this._visible = true;

		/** @type {Image360|null} */
		this.focusedImage = null;

		this._onUpdate = () => this.update();
		viewer.addEventListener("update", this._onUpdate);
		viewer.inputHandler.addInputListener(this);

		this.addEventListener("mousedown", () => {
			if(currentlyHovered && currentlyHovered.image360){
				this.focus(currentlyHovered.image360);
			}
		});
	}

	/** Detach the viewer/input hooks. Call before discarding the set. */
	dispose(){
		this.viewer.removeEventListener("update", this._onUpdate);
		this.viewer.inputHandler.removeInputListener(this);
	}

	set visible(visible){
		if(this._visible === visible){
			return;
		}

		for(const image of this.images){
			if(image.mesh){
				image.mesh.visible = visible && (this.focusedImage == null);
			}
		}

		this.sphere.visible = visible && (this.focusedImage != null);
		this._visible = visible;
		this.dispatchEvent({
			type: "visibility_changed",
			images: this,
		});
	}

	get visible(){
		return this._visible;
	}

	focus(image360){
		if(this.focusedImage !== null){
			this.unfocus();
		}

		previousView = {
			controls: this.viewer.controls,
			position: this.viewer.scene.view.position.clone(),
			target: this.viewer.scene.view.getPivot(),
		};

		this.viewer.setControls(this.viewer.orbitControls);
		this.viewer.orbitControls.doubleClockZoomEnabled = false;

		for(let image of this.images){
			if(image.mesh){
				image.mesh.visible = false;
			}
		}

		this.selectingEnabled = false;

		this.sphere.visible = false;

		this.load(image360).then(() => {
			this.sphere.visible = true;
			this.sphere.material.map = image360.texture;
			this.sphere.material.needsUpdate = true;
		});

		{ // orientation
			let {course, pitch, roll} = image360;
			this.sphere.rotation.set(
				THREE.MathUtils.degToRad(+roll + 90),
				THREE.MathUtils.degToRad(-pitch),
				THREE.MathUtils.degToRad(-course + 90),
				"ZYX"
			);
		}

		const p = image360.position;
		this.sphere.position.set(p[0], p[1], p[2]);

		let target = new THREE.Vector3(p[0], p[1], p[2]);
		let dir = target.clone().sub(this.viewer.scene.view.position).normalize();
		let move = dir.multiplyScalar(0.000001);
		let newCamPos = target.clone().sub(move);

		this.viewer.scene.view.setView(newCamPos, target, 500);

		this.focusedImage = image360;

		this.dispatchEvent({type: "focus", image: image360, images: this});
	}

	unfocus(){
		this.selectingEnabled = true;

		for(let image of this.images){
			if(image.mesh){
				image.mesh.visible = true;
			}
		}

		let image = this.focusedImage;

		if(image === null){
			return;
		}

		this.sphere.material.map = null;
		this.sphere.material.needsUpdate = true;
		this.sphere.visible = false;

		this.viewer.orbitControls.doubleClockZoomEnabled = true;
		this.viewer.setControls(previousView.controls);

		this.viewer.scene.view.setView(
			previousView.position,
			previousView.target,
			500
		);

		this.focusedImage = null;

		this.dispatchEvent({type: "unfocus", image, images: this});
	}

	load(image360){

		return new Promise(resolve => {
			let texture = new THREE.TextureLoader().load(image360.file, resolve);
			texture.wrapS = THREE.RepeatWrapping;
			texture.repeat.x = -1;

			image360.texture = texture;
		});
	}

	handleHovering(){
		let {viewer} = this;
		let mouse = viewer.inputHandler.mouse;
		let camera = viewer.scene.getActiveCamera();
		let domElement = viewer.renderer.domElement;

		let ray = mouseToRay(mouse, camera, domElement.clientWidth, domElement.clientHeight);

		raycaster.ray.copy(ray);
		let intersections = raycaster.intersectObjects(this.node.children);

		if(intersections.length === 0){
			return;
		}

		let intersection = intersections[0];
		currentlyHovered = /** @type {any} */ (intersection.object);
		currentlyHovered.material = smHovered;
	}

	update(){

		if(currentlyHovered){
			currentlyHovered.material = sm;
			currentlyHovered = null;
		}

		if(this.selectingEnabled){
			this.handleHovering();
		}
	}
}

export class Images360Loader{

	/**
	 * @param {string} url directory holding `coordinates.txt` and the images
	 * @param {import("../../core/Viewer.js").Viewer} viewer
	 * @param {{transform?: {forward: (lonLat: number[]) => number[]}}} [params]
	 * @returns {Promise<Images360>}
	 */
	static async load(url, viewer, params = {}){

		const transform = params.transform ?? {forward: (a) => a};

		let response = await fetch(`${url}/coordinates.txt`);
		let text = await response.text();

		let lines = text.split(/\r?\n/);
		let coordinateLines = lines.slice(1);

		let images360 = new Images360(viewer);

		for(let line of coordinateLines){

			if(line.trim().length === 0){
				continue;
			}

			let tokens = line.split(/\t/);

			let filename = tokens[0].replace(/"/g, "");
			let time = parseFloat(tokens[1]);
			let long = parseFloat(tokens[2]);
			let lat = parseFloat(tokens[3]);
			let alt = parseFloat(tokens[4]);
			let course = parseFloat(tokens[5]);
			let pitch = parseFloat(tokens[6]);
			let roll = parseFloat(tokens[7]);

			let file = `${url}/${filename}`;

			let image360 = new Image360(file, time, long, lat, alt, course, pitch, roll);

			let xy = transform.forward([long, lat]);
			image360.position = [xy[0], xy[1], alt];

			images360.images.push(image360);
		}

		Images360Loader.createSceneNodes(images360, transform);

		return images360;
	}

	static createSceneNodes(images360, transform){

		for(let image360 of images360.images){
			let {longitude, latitude, altitude} = image360;
			let xy = transform.forward([longitude, latitude]);

			let mesh = new THREE.Mesh(sg, sm);
			mesh.position.set(xy[0], xy[1], altitude);
			mesh.scale.set(1, 1, 1);
			mesh.material.transparent = true;
			mesh.material.opacity = 0.75;
			/** @type {any} */ (mesh).image360 = image360;

			{ // orientation
				let {course, pitch, roll} = image360;
				mesh.rotation.set(
					THREE.MathUtils.degToRad(+roll + 90),
					THREE.MathUtils.degToRad(-pitch),
					THREE.MathUtils.degToRad(-course + 90),
					"ZYX"
				);
			}

			images360.node.add(mesh);

			image360.mesh = mesh;
		}
	}
}
