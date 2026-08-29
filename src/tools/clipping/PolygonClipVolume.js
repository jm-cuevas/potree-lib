import * as THREE from "three";

/**
 * Screen-space polygon clip region: a frozen copy of the camera at insertion
 * time plus a list of projected marker meshes (one per polygon vertex). The
 * point-cloud material reprojects each point through `viewMatrix`/`projMatrix`
 * and tests it against the 2D polygon. Pure three.js/data - the SVG drawing
 * feedback shown while placing vertices is the consuming app's job (see
 * `ClippingTool.startInsertion`).
 */
let polygonClipVolumeCounter = 0;

export class PolygonClipVolume extends THREE.Object3D{

	constructor(camera){
		super();

		this.name = "polygon_clip_volume_" + (polygonClipVolumeCounter++);

		this.camera = camera.clone();
		this.camera.rotation.set(...camera.rotation.toArray()); // [r85] workaround because camera.clone() doesn't work on rotation
		this.camera.rotation.order = camera.rotation.order;
		this.camera.updateMatrixWorld();
		this.camera.updateProjectionMatrix();
		this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

		this.viewMatrix = this.camera.matrixWorldInverse.clone();
		this.projMatrix = this.camera.projectionMatrix.clone();

		// projected markers
		this.markers = [];
		this.initialized = false;
	}

	addMarker() {
		let marker = new THREE.Mesh();

		let cancel;

		let drag = e => {
			let size = e.viewer.renderer.getSize(new THREE.Vector2());
			let projectedPos = new THREE.Vector3(
				2.0 * (e.drag.end.x / size.width) - 1.0,
				-2.0 * (e.drag.end.y / size.height) + 1.0,
				0
			);

			marker.position.copy(projectedPos);
		};

		let drop = e => {
			cancel();
		};

		cancel = e => {
			marker.removeEventListener("drag", drag);
			marker.removeEventListener("drop", drop);
		};

		marker.addEventListener("drag", drag);
		marker.addEventListener("drop", drop);

		this.markers.push(marker);
	}

	removeLastMarker() {
		if(this.markers.length > 0) {
			this.markers.splice(this.markers.length - 1, 1);
		}
	}

}
