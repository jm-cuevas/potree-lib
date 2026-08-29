import * as THREE from "three";
import {TextSprite} from "../../utils/TextSprite.js";

let boxVolumeCounter = 0;
let sphereVolumeCounter = 0;

/**
 * Base class for the measurable / clipping volumes (`BoxVolume`,
 * `SphereVolume`). Pure three.js `Object3D` gizmos - a translucent solid, a
 * black wireframe frame and a `TextSprite` label showing the computed
 * volume. `clip === true` turns the volume into a clipping region (the solid
 * and label are hidden and the point-cloud material reads its transform).
 *
 * Subclasses set `isBoxVolume` / `isSphereVolume` duck-type flags so the
 * render pipeline can pick out clip boxes vs. clip spheres without importing
 * this module (mirrors three.js's own `isMesh` convention).
 */
export class Volume extends THREE.Object3D {
	constructor (args = {}) {
		super();

		if(this.constructor.name === "Volume"){
			console.warn("Can't create object of class Volume directly. Use classes BoxVolume or SphereVolume instead.");
		}

		this._clip = args.clip || false;
		this._visible = true;
		this.showVolumeLabel = true;
		this._modifiable = args.modifiable || true;

		this.label = new TextSprite('0');
		this.label.setBorderColor({r: 0, g: 255, b: 0, a: 0.0});
		this.label.setBackgroundColor({r: 0, g: 255, b: 0, a: 0.0});
		this.label.material.depthTest = false;
		this.label.material.depthWrite = false;
		this.label.material.transparent = true;
		this.label.position.y -= 0.5;
		this.add(this.label);

		this.label.updateMatrixWorld = () => {
			let volumeWorldPos = new THREE.Vector3();
			volumeWorldPos.setFromMatrixPosition(this.matrixWorld);
			this.label.position.copy(volumeWorldPos);
			this.label.updateMatrix();
			this.label.matrixWorld.copy(this.label.matrix);
			this.label.matrixWorldNeedsUpdate = false;

			for (let i = 0, l = this.label.children.length; i < l; i++) {
				this.label.children[i].updateMatrixWorld(true);
			}
		};

		{ // event listeners
			this.addEventListener('select', e => {});
			this.addEventListener('deselect', e => {});
		}
	}

	// @ts-expect-error TS2611: three.js declares Object3D.visible as a plain
	// property; overriding it as an accessor (to fire visibility_changed)
	// can't be expressed under checkJs without casting every call site.
	get visible(){
		return this._visible;
	}

	set visible(value){
		if(this._visible !== value){
			this._visible = value;

			this.dispatchEvent({type: "visibility_changed", object: this});
		}
	}

	getVolume () {
		console.warn("override this in subclass");
	}

	update () {

	}

	raycast (raycaster, intersects) {

	}

	get clip () {
		return this._clip;
	}

	set clip (value) {
		if(this._clip !== value){
			this._clip = value;

			this.update();

			this.dispatchEvent({
				type: "clip_changed",
				object: this
			});
		}
	}

	get modifieable () {
		return this._modifiable;
	}

	set modifieable (value) {
		this._modifiable = value;

		this.update();
	}
}

export class BoxVolume extends Volume{

	constructor(args = {}){
		super(args);

		this.isBoxVolume = true;

		this.name = 'box_' + (boxVolumeCounter++);

		let boxGeometry = new THREE.BoxGeometry(1, 1, 1);
		boxGeometry.computeBoundingBox();

		// black wireframe frame - was a THREE.Geometry line list upstream,
		// rebuilt here as a BufferGeometry LineSegments (12 edges).
		let framePoints = [
			// bottom
			new THREE.Vector3(-0.5, -0.5, 0.5), new THREE.Vector3(0.5, -0.5, 0.5),
			new THREE.Vector3(0.5, -0.5, 0.5), new THREE.Vector3(0.5, -0.5, -0.5),
			new THREE.Vector3(0.5, -0.5, -0.5), new THREE.Vector3(-0.5, -0.5, -0.5),
			new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(-0.5, -0.5, 0.5),
			// top
			new THREE.Vector3(-0.5, 0.5, 0.5), new THREE.Vector3(0.5, 0.5, 0.5),
			new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Vector3(0.5, 0.5, -0.5),
			new THREE.Vector3(0.5, 0.5, -0.5), new THREE.Vector3(-0.5, 0.5, -0.5),
			new THREE.Vector3(-0.5, 0.5, -0.5), new THREE.Vector3(-0.5, 0.5, 0.5),
			// sides
			new THREE.Vector3(-0.5, -0.5, 0.5), new THREE.Vector3(-0.5, 0.5, 0.5),
			new THREE.Vector3(0.5, -0.5, 0.5), new THREE.Vector3(0.5, 0.5, 0.5),
			new THREE.Vector3(0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, -0.5),
			new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(-0.5, 0.5, -0.5),
		];
		let boxFrameGeometry = new THREE.BufferGeometry().setFromPoints(framePoints);

		this.material = new THREE.MeshBasicMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.3,
			depthTest: true,
			depthWrite: false});
		this.box = new THREE.Mesh(boxGeometry, this.material);
		this.box.geometry.computeBoundingBox();
		this.boundingBox = this.box.geometry.boundingBox;
		this.add(this.box);

		this.frame = new THREE.LineSegments(boxFrameGeometry, new THREE.LineBasicMaterial({color: 0x000000}));
		this.add(this.frame);

		this.update();
	}

	update(){
		this.boundingBox = this.box.geometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());

		if (this._clip) {
			this.box.visible = false;
			this.label.visible = false;
		} else {
			this.box.visible = true;
			this.label.visible = this.showVolumeLabel;
		}
	}

	raycast (raycaster, intersects) {
		let is = [];
		this.box.raycast(raycaster, is);

		if (is.length > 0) {
			let I = is[0];
			intersects.push({
				distance: I.distance,
				object: this,
				point: I.point.clone()
			});
		}
	}

	getVolume(){
		return Math.abs(this.scale.x * this.scale.y * this.scale.z);
	}

}

export class SphereVolume extends Volume{

	constructor(args = {}){
		super(args);

		this.isSphereVolume = true;

		this.name = 'sphere_' + (sphereVolumeCounter++);

		let sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
		sphereGeometry.computeBoundingBox();

		this.material = new THREE.MeshBasicMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.3,
			depthTest: true,
			depthWrite: false});
		this.sphere = new THREE.Mesh(sphereGeometry, this.material);
		this.sphere.visible = false;
		this.sphere.geometry.computeBoundingBox();
		this.boundingBox = this.sphere.geometry.boundingBox;
		this.add(this.sphere);

		this.label.visible = false;

		// wireframe frame - upstream built a THREE.Geometry vertex-pair list
		// (meridian arcs + latitude rings); rebuilt as a BufferGeometry
		// LineSegments here.
		let framePoints = [];
		{
			let steps = 64;
			let uSegments = 8;
			let vSegments = 5;

			for(let uSegment = 0; uSegment < uSegments; uSegment++){
				let alpha = (uSegment / uSegments) * Math.PI * 2;
				let dirx = Math.cos(alpha);
				let diry = Math.sin(alpha);

				for(let i = 0; i <= steps; i++){
					let v = (i / steps) * Math.PI * 2;
					let vNext = v + 2 * Math.PI / steps;

					let height = Math.sin(v);
					let xyAmount = Math.cos(v);

					let heightNext = Math.sin(vNext);
					let xyAmountNext = Math.cos(vNext);

					framePoints.push(new THREE.Vector3(dirx * xyAmount, diry * xyAmount, height));
					framePoints.push(new THREE.Vector3(dirx * xyAmountNext, diry * xyAmountNext, heightNext));
				}
			}

			// rings at poles, just because it's easier to implement
			for(let vSegment = 0; vSegment <= vSegments + 1; vSegment++){
				let uh = (vSegment / (vSegments + 1));
				uh = (1 - uh) * (-Math.PI / 2) + uh * (Math.PI / 2);
				let height = Math.sin(uh);

				for(let i = 0; i <= steps; i++){
					let u = (i / steps) * Math.PI * 2;
					let uNext = u + 2 * Math.PI / steps;

					let dirx = Math.cos(u);
					let diry = Math.sin(u);

					let dirxNext = Math.cos(uNext);
					let diryNext = Math.sin(uNext);

					let xyAmount = Math.sqrt(1 - height * height);

					framePoints.push(new THREE.Vector3(dirx * xyAmount, diry * xyAmount, height));
					framePoints.push(new THREE.Vector3(dirxNext * xyAmount, diryNext * xyAmount, height));
				}
			}
		}

		let frameGeometry = new THREE.BufferGeometry().setFromPoints(framePoints);
		this.frame = new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({color: 0x000000}));
		this.add(this.frame);

		this.update();
	}

	update(){
		this.boundingBox = this.sphere.geometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());
	}

	raycast (raycaster, intersects) {
		let is = [];
		this.sphere.raycast(raycaster, is);

		if (is.length > 0) {
			let I = is[0];
			intersects.push({
				distance: I.distance,
				object: this,
				point: I.point.clone()
			});
		}
	}

	// see https://en.wikipedia.org/wiki/Ellipsoid#Volume
	getVolume(){
		return (4 / 3) * Math.PI * this.scale.x * this.scale.y * this.scale.z;
	}

}
