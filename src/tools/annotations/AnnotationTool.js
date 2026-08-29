import * as THREE from "three";
import {Annotation} from "./Annotation.js";
import {getMousePointCloudIntersection} from "../../utils/geometry.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";

/**
 * Drag-to-place insertion helper for `Annotation`s. Instantiate with
 * `new AnnotationTool(viewer)`; `startInsertion()` adds a fresh annotation
 * to `viewer.scene.annotations` and drags it onto the point cloud, updating
 * `annotation.position` as the pointer moves. The annotation's DOM popup is
 * the consuming app's concern (see `Annotation`).
 */
export class AnnotationTool extends EventDispatcher{
	constructor (viewer) {
		super();

		this.viewer = viewer;
		this.renderer = viewer.renderer;

		this.sg = new THREE.SphereGeometry(0.1);
		this.sm = new THREE.MeshNormalMaterial();
		this.s = new THREE.Mesh(this.sg, this.sm);
	}

	startInsertion (args = {}) {
		let domElement = this.viewer.renderer.domElement;

		let annotation = new Annotation({
			position: args.position || [0, 0, 0],
			title: args.title || "Annotation Title",
			description: args.description || `Annotation Description`
		});
		this.dispatchEvent({type: 'start_inserting_annotation', annotation: annotation});

		const annotations = this.viewer.scene.annotations;
		annotations.add(annotation);

		let callbacks = {
			cancel: null,
			finish: null,
		};

		let insertionCallback = (e) => {
			if (e.button === THREE.MOUSE.LEFT) {
				callbacks.finish();
			} else if (e.button === THREE.MOUSE.RIGHT) {
				callbacks.cancel();
			}
		};

		callbacks.cancel = e => {
			annotations.remove(annotation);

			domElement.removeEventListener('mouseup', insertionCallback, true);
		};

		callbacks.finish = e => {
			domElement.removeEventListener('mouseup', insertionCallback, true);
		};

		domElement.addEventListener('mouseup', insertionCallback, true);

		let drag = (e) => {
			let I = getMousePointCloudIntersection(
				e.drag.end,
				e.viewer.scene.getActiveCamera(),
				e.viewer,
				e.viewer.scene.pointclouds,
				{pickClipped: true});

			if (I) {
				this.s.position.copy(I.location);

				annotation.position.copy(I.location);
			}
		};

		let drop = (e) => {
			this.viewer.scene.scene.remove(this.s);
			this.s.removeEventListener("drag", drag);
			this.s.removeEventListener("drop", drop);
		};

		this.s.addEventListener('drag', drag);
		this.s.addEventListener('drop', drop);

		this.viewer.scene.scene.add(this.s);
		this.viewer.inputHandler.startDragging(this.s);

		return annotation;
	}

	update(){

	}

	render(){

	}
}
