import * as THREE from "three";
import {Volume, BoxVolume} from "./Volume.js";
import {addCommas} from "../../utils/misc.js";
import {projectedRadius, getMousePointCloudIntersection} from "../../utils/geometry.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";

/**
 * Orchestrates `Volume` (box / sphere) insertion and per-frame label
 * upkeep. Owns a private `THREE.Scene` drawn in the `render.pass.scene`
 * pass. Instantiate with `new VolumeTool(viewer)` from the consuming app;
 * `startInsertion({clip, type})` drags a new volume onto the point cloud.
 */
export class VolumeTool extends EventDispatcher{
	constructor (viewer) {
		super();

		this.viewer = viewer;
		this.renderer = viewer.renderer;

		this.addEventListener('start_inserting_volume', e => {
			this.viewer.dispatchEvent({
				type: 'cancel_insertions'
			});
		});

		this.scene = new THREE.Scene();
		this.scene.name = 'scene_volume';

		this.viewer.inputHandler.registerInteractiveScene(this.scene);

		this.onRemove = e => {
			this.scene.remove(e.volume);
		};

		this.onAdd = e => {
			this.scene.add(e.volume);
		};

		for(let volume of viewer.scene.volumes){
			this.onAdd({volume: volume});
		}

		this.viewer.inputHandler.addEventListener('delete', e => {
			let volumes = e.selection.filter(e => (e instanceof Volume));
			volumes.forEach(e => this.viewer.scene.removeVolume(e));
		});

		viewer.addEventListener("update", this.update.bind(this));
		viewer.addEventListener("render.pass.scene", e => this.render(e));
		viewer.addEventListener("scene_changed", this.onSceneChange.bind(this));

		viewer.scene.addEventListener('volume_added', this.onAdd);
		viewer.scene.addEventListener('volume_removed', this.onRemove);
	}

	onSceneChange(e){
		if(e.oldScene){
			e.oldScene.removeEventListener('volume_added', this.onAdd);
			e.oldScene.removeEventListener('volume_removed', this.onRemove);
		}

		e.scene.addEventListener('volume_added', this.onAdd);
		e.scene.addEventListener('volume_removed', this.onRemove);
	}

	startInsertion (args = {}) {
		let volume;
		if(args.type){
			volume = new args.type();
		}else{
			volume = new BoxVolume();
		}

		volume.clip = args.clip || false;
		volume.name = args.name || 'Volume';

		this.dispatchEvent({
			type: 'start_inserting_volume',
			volume: volume
		});

		this.viewer.scene.addVolume(volume);
		this.scene.add(volume);

		let cancel = {
			callback: null
		};

		let drag = e => {
			let camera = this.viewer.scene.getActiveCamera();

			let I = getMousePointCloudIntersection(
				e.drag.end,
				this.viewer.scene.getActiveCamera(),
				this.viewer,
				this.viewer.scene.pointclouds,
				{pickClipped: false});

			if (I) {
				volume.position.copy(I.location);

				let wp = volume.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
				let w = Math.abs((wp.z / 5));
				volume.scale.set(w, w, w);
			}
		};

		let drop = e => {
			volume.removeEventListener('drag', drag);
			volume.removeEventListener('drop', drop);

			cancel.callback();
		};

		cancel.callback = e => {
			volume.removeEventListener('drag', drag);
			volume.removeEventListener('drop', drop);
			this.viewer.removeEventListener('cancel_insertions', cancel.callback);
		};

		volume.addEventListener('drag', drag);
		volume.addEventListener('drop', drop);
		this.viewer.addEventListener('cancel_insertions', cancel.callback);

		this.viewer.inputHandler.startDragging(volume);

		return volume;
	}

	update(){
		if (!this.viewer.scene) {
			return;
		}

		let camera = this.viewer.scene.getActiveCamera();
		let renderAreaSize = this.viewer.renderer.getSize(new THREE.Vector2());
		let clientWidth = renderAreaSize.width;
		let clientHeight = renderAreaSize.height;

		let volumes = this.viewer.scene.volumes;
		for (let volume of volumes) {
			let label = volume.label;

			{
				let distance = label.position.distanceTo(camera.position);
				let pr = projectedRadius(1, camera, distance, clientWidth, clientHeight);

				let scale = (70 / pr);
				label.scale.set(scale, scale, scale);
			}

			let calculatedVolume = volume.getVolume();
			calculatedVolume = calculatedVolume / Math.pow(this.viewer.lengthUnit.unitspermeter, 3) * Math.pow(this.viewer.lengthUnitDisplay.unitspermeter, 3);
			let text = addCommas(calculatedVolume.toFixed(3)) + ' ' + this.viewer.lengthUnitDisplay.code + '³';
			label.setText(text);
		}
	}

	render(params){
		const renderer = this.viewer.renderer;

		const oldTarget = renderer.getRenderTarget();

		if(params.renderTarget){
			renderer.setRenderTarget(params.renderTarget);
		}
		renderer.render(this.scene, this.viewer.scene.getActiveCamera());
		renderer.setRenderTarget(oldTarget);
	}

}
