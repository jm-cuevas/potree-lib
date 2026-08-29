import * as THREE from "three";
import {BoxVolume} from "../clipping/Volume.js";
import {mouseToRay} from "../../utils/geometry.js";
import {PointSizeType} from "../../core/defines.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";

/**
 * Drag a screen-space rectangle to carve out an oriented clip `BoxVolume`
 * around the points under the marquee: on drop it double-picks the point
 * cloud (near plane + far plane) to tighten the box depth to the actual
 * point extent, then flips the volume to `clip = true`.
 *
 * The jQuery marquee `<div>` upstream drew is not part of the headless core;
 * instead this emits `select_box_start` / `select_box_drag` (with a
 * `THREE.Box2` in screen pixels) / `select_box_drop`, and the consuming app
 * draws the rectangle from those.
 */
export class ScreenBoxSelectTool extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;
		this.scene = new THREE.Scene();

		viewer.addEventListener("update", this.update.bind(this));
		viewer.addEventListener("render.pass.perspective_overlay", this.render.bind(this));
		viewer.addEventListener("scene_changed", this.onSceneChange.bind(this));
	}

	onSceneChange(scene){

	}

	startInsertion(){
		let volume = new BoxVolume();
		volume.position.set(12345, 12345, 12345);
		volume.showVolumeLabel = false;
		volume.visible = false;
		volume.update();
		this.viewer.scene.addVolume(volume);

		this.importance = 10;

		this.dispatchEvent({type: "select_box_start", volume: volume});

		let drag = e => {
			volume.visible = true;

			let mStart = e.drag.start;
			let mEnd = e.drag.end;

			let box2D = new THREE.Box2();
			box2D.expandByPoint(mStart);
			box2D.expandByPoint(mEnd);

			this.dispatchEvent({type: "select_box_drag", volume: volume, box2D: box2D});

			let camera = e.viewer.scene.getActiveCamera();
			let size = e.viewer.renderer.getSize(new THREE.Vector2());
			let frustumSize = new THREE.Vector2(
				camera.right - camera.left,
				camera.top - camera.bottom);

			let screenCentroid = new THREE.Vector2().addVectors(e.drag.end, e.drag.start).multiplyScalar(0.5);
			let ray = mouseToRay(screenCentroid, camera, size.width, size.height);

			let diff = new THREE.Vector2().subVectors(e.drag.end, e.drag.start);
			diff.divide(size).multiply(frustumSize);

			volume.position.copy(ray.origin);
			volume.up.copy(camera.up);
			volume.rotation.copy(camera.rotation);
			volume.scale.set(diff.x, diff.y, 1000 * 100);

			e.consume();
		};

		let drop = e => {
			this.importance = 0;

			this.dispatchEvent({type: "select_box_drop", volume: volume});

			this.viewer.inputHandler.deselectAll();
			this.viewer.inputHandler.toggleSelection(volume);

			let camera = e.viewer.scene.getActiveCamera();
			let size = e.viewer.renderer.getSize(new THREE.Vector2());
			let screenCentroid = new THREE.Vector2().addVectors(e.drag.end, e.drag.start).multiplyScalar(0.5);
			let ray = mouseToRay(screenCentroid, camera, size.width, size.height);

			this.removeEventListener("drag", drag);
			this.removeEventListener("drop", drop);

			let allPointsNear = [];
			let allPointsFar = [];

			// TODO support more than one point cloud
			for(let pointcloud of this.viewer.scene.pointclouds){

				if(!pointcloud.visible){
					continue;
				}

				let volCam = camera.clone();
				volCam.left = -volume.scale.x / 2;
				volCam.right = +volume.scale.x / 2;
				volCam.top = +volume.scale.y / 2;
				volCam.bottom = -volume.scale.y / 2;
				volCam.near = -volume.scale.z / 2;
				volCam.far = +volume.scale.z / 2;
				volCam.rotation.copy(volume.rotation);
				volCam.position.copy(volume.position);

				volCam.updateMatrix();
				volCam.updateMatrixWorld();
				volCam.updateProjectionMatrix();
				volCam.matrixWorldInverse.copy(volCam.matrixWorld).invert();

				let ray2 = new THREE.Ray(volCam.getWorldPosition(new THREE.Vector3()), volCam.getWorldDirection(new THREE.Vector3()));
				let rayInverse = new THREE.Ray(
					ray2.origin.clone().add(ray2.direction.clone().multiplyScalar(volume.scale.z)),
					ray2.direction.clone().multiplyScalar(-1));

				let pickerSettings = {
					width: 8,
					height: 8,
					pickWindowSize: 8,
					all: true,
					pickClipped: true,
					pointSizeType: PointSizeType.FIXED,
					pointSize: 1};
				let pointsNear = pointcloud.pick(this.viewer, volCam, ray2, pickerSettings);

				volCam.rotateX(Math.PI);
				volCam.updateMatrix();
				volCam.updateMatrixWorld();
				volCam.updateProjectionMatrix();
				volCam.matrixWorldInverse.copy(volCam.matrixWorld).invert();
				let pointsFar = pointcloud.pick(this.viewer, volCam, rayInverse, pickerSettings);

				allPointsNear.push(...pointsNear);
				allPointsFar.push(...pointsFar);
			}

			if(allPointsNear.length > 0 && allPointsFar.length > 0){
				let viewLine = new THREE.Line3(ray.origin, new THREE.Vector3().addVectors(ray.origin, ray.direction));

				let closestOnLine = allPointsNear.map(p => viewLine.closestPointToPoint(p.position, false, new THREE.Vector3()));
				let closest = closestOnLine.sort((a, b) => ray.origin.distanceTo(a) - ray.origin.distanceTo(b))[0];

				let farthestOnLine = allPointsFar.map(p => viewLine.closestPointToPoint(p.position, false, new THREE.Vector3()));
				let farthest = farthestOnLine.sort((a, b) => ray.origin.distanceTo(b) - ray.origin.distanceTo(a))[0];

				let distance = closest.distanceTo(farthest);
				let centroid = new THREE.Vector3().addVectors(closest, farthest).multiplyScalar(0.5);
				volume.scale.z = distance * 1.1;
				volume.position.copy(centroid);
			}

			volume.clip = true;
		};

		this.addEventListener("drag", drag);
		this.addEventListener("drop", drop);

		this.viewer.inputHandler.addInputListener(this);

		return volume;
	}

	update(e){

	}

	render(){
		this.viewer.renderer.render(this.scene, this.viewer.scene.getActiveCamera());
	}

}
