import * as THREE from "three";
import {ClipVolume} from "./ClipVolume.js";
import {PolygonClipVolume} from "./PolygonClipVolume.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";

/**
 * Orchestrates polygon-clip-volume insertion. `Viewer` reads
 * `viewer.clippingTool` (null by default) when building the clip-polygon
 * uniforms for `PointCloudMaterial`, so a consuming app that wants polygon
 * clipping assigns `viewer.clippingTool = new ClippingTool(viewer)` and then
 * calls `setScene(viewer.scene)` (also re-called on `scene_changed`).
 *
 * The upstream jQuery SVG drawing feedback (the dashed polyline + diamond
 * vertex markers overlaid on the canvas while placing points) is not part of
 * the headless core: instead `startInsertion` emits
 * `clip_polygon_started` / `clip_polygon_vertex_added` / `clip_polygon_finished`
 * events carrying the screen-space vertex positions, and the consuming app
 * draws whatever overlay it wants from those.
 */
export class ClippingTool extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;

		this.maxPolygonVertices = 8;

		this.addEventListener("start_inserting_clipping_volume", e => {
			this.viewer.dispatchEvent({
				type: "cancel_insertions"
			});
		});

		this.sceneMarker = new THREE.Scene();
		this.sceneVolume = new THREE.Scene();
		this.sceneVolume.name = "scene_clip_volume";
		this.viewer.inputHandler.registerInteractiveScene(this.sceneVolume);

		this.onRemove = e => {
			this.sceneVolume.remove(e.volume);
		};

		this.onAdd = e => {
			this.sceneVolume.add(e.volume);
		};

		this.viewer.inputHandler.addEventListener("delete", e => {
			let volumes = e.selection.filter(e => (e instanceof ClipVolume));
			volumes.forEach(e => this.viewer.scene.removeClipVolume?.(e));
			let polyVolumes = e.selection.filter(e => (e instanceof PolygonClipVolume));
			polyVolumes.forEach(e => this.viewer.scene.removePolygonClipVolume(e));
		});
	}

	setScene(scene){
		if(this.scene === scene){
			return;
		}

		if(this.scene){
			this.scene.removeEventListener("clip_volume_added", this.onAdd);
			this.scene.removeEventListener("clip_volume_removed", this.onRemove);
			this.scene.removeEventListener("polygon_clip_volume_added", this.onAdd);
			this.scene.removeEventListener("polygon_clip_volume_removed", this.onRemove);
		}

		this.scene = scene;

		this.scene.addEventListener("clip_volume_added", this.onAdd);
		this.scene.addEventListener("clip_volume_removed", this.onRemove);
		this.scene.addEventListener("polygon_clip_volume_added", this.onAdd);
		this.scene.addEventListener("polygon_clip_volume_removed", this.onRemove);
	}

	startInsertion(args = {}) {
		let type = args.type || null;

		if(!type) return null;

		const domElement = this.viewer.renderer.domElement;

		let polyClipVol = new PolygonClipVolume(this.viewer.scene.getActiveCamera().clone());

		// `PolygonClipVolume` markers hold screen-space (NDC) positions that
		// `Renderer.js` reprojects against the frozen `viewMatrix`/`projMatrix`.
		// Upstream drove them through the `InputHandler` drag machinery, but
		// in the headless build `onMouseUp` nulls the active drag right after
		// each click (and the marker's own drop handler unsubscribes itself),
		// so every vertex past the first stayed at the origin and the polygon
		// was degenerate. Here the trailing marker is positioned directly
		// from the pointer instead: `mousemove` rubber-bands it, `mouseup`
		// (left) commits it and appends a fresh trailing marker.
		const toNDC = (offsetX, offsetY) => {
			const size = this.viewer.renderer.getSize(new THREE.Vector2());
			return new THREE.Vector3(
				2.0 * (offsetX / size.width) - 1.0,
				-2.0 * (offsetY / size.height) + 1.0,
				0);
		};
		const setTrailing = (offsetX, offsetY) => {
			const last = polyClipVol.markers[polyClipVol.markers.length - 1];
			if(last){
				last.position.copy(toNDC(offsetX, offsetY));
			}
		};

		this.dispatchEvent({type: "start_inserting_clipping_volume"});
		this.dispatchEvent({type: "clip_polygon_started", volume: polyClipVol});

		this.viewer.scene.addPolygonClipVolume(polyClipVol);
		this.sceneMarker.add(polyClipVol);

		let cancel = {
			callback: null
		};

		let moveCallback = (e) => {
			setTrailing(e.offsetX, e.offsetY);
			this.dispatchEvent({
				type: "clip_polygon_vertex_moved",
				volume: polyClipVol,
				x: e.offsetX,
				y: e.offsetY,
			});
		};

		let insertionCallback = (e) => {
			if(e.button === THREE.MOUSE.LEFT){
				// commit the trailing marker here, then append the next one
				setTrailing(e.offsetX, e.offsetY);
				polyClipVol.addMarker();
				setTrailing(e.offsetX, e.offsetY);

				this.dispatchEvent({
					type: "clip_polygon_vertex_added",
					volume: polyClipVol,
					x: e.offsetX,
					y: e.offsetY,
				});

				if(polyClipVol.markers.length > this.maxPolygonVertices){
					cancel.callback();
				}
			}else if(e.button === THREE.MOUSE.RIGHT){
				cancel.callback(e);
			}
		};

		cancel.callback = e => {
			if(polyClipVol.markers.length > 3) {
				polyClipVol.removeLastMarker();
				polyClipVol.initialized = true;
			} else {
				this.viewer.scene.removePolygonClipVolume(polyClipVol);
			}

			domElement.removeEventListener("mouseup", insertionCallback, true);
			domElement.removeEventListener("mousemove", moveCallback, true);
			this.viewer.removeEventListener("cancel_insertions", cancel.callback);
			this.viewer.inputHandler.enabled = true;

			this.dispatchEvent({type: "clip_polygon_finished", volume: polyClipVol});
		};

		this.viewer.addEventListener("cancel_insertions", cancel.callback);
		domElement.addEventListener("mouseup", insertionCallback, true);
		domElement.addEventListener("mousemove", moveCallback, true);
		this.viewer.inputHandler.enabled = false;

		polyClipVol.addMarker();

		return polyClipVol;
	}

	update() {

	}
}
