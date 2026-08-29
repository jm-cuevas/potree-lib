import * as THREE from "three";

/**
 * Default (no EDL, no HQ splatting) render pipeline: point cloud octree pass
 * via `viewer.pRenderer`, then the regular three.js scene, then optional
 * tool overlays.
 *
 * `clippingTool`/`transformationTool`/`navigationCube` are read from the
 * viewer but treated as optional so this renderer doesn't hard-require the
 * tools modules - a headless `Viewer` with no tools attached still renders.
 */
export class PotreeRenderer {

	constructor(viewer){
		this.viewer = viewer;
		this.renderer = viewer.renderer;
	}

	clearTargets(){

	}

	clear(){
		let {viewer, renderer} = this;

		if(viewer.background === "skybox"){
			renderer.setClearColor(0xff0000, 1);
		}else if(viewer.background === "gradient"){
			renderer.setClearColor(0x00ff00, 1);
		}else if(viewer.background === "black"){
			renderer.setClearColor(0x000000, 1);
		}else if(viewer.background === "white"){
			renderer.setClearColor(0xFFFFFF, 1);
		}else{
			renderer.setClearColor(0x000000, 0);
		}

		renderer.clear();
	}

	render(params){
		let {viewer, renderer} = this;

		const camera = params.camera ? params.camera : viewer.scene.getActiveCamera();

		viewer.dispatchEvent({type: "render.pass.begin", viewer: viewer});

		// render skybox
		if(viewer.background === "skybox"){
			viewer.skybox.camera.rotation.copy(viewer.scene.cameraP.rotation);
			viewer.skybox.camera.fov = viewer.scene.cameraP.fov;
			viewer.skybox.camera.aspect = viewer.scene.cameraP.aspect;

			viewer.skybox.parent.rotation.x = 0;
			viewer.skybox.parent.updateMatrixWorld();

			viewer.skybox.camera.updateProjectionMatrix();
			renderer.render(viewer.skybox.scene, viewer.skybox.camera);
		}else if(viewer.background === "gradient"){
			renderer.render(viewer.scene.sceneBG, viewer.scene.cameraBG);
		}

		for(let pointcloud of viewer.scene.pointclouds){
			const {material} = pointcloud;
			material.useEDL = false;
		}

		viewer.pRenderer.render(viewer.scene.scenePointCloud, camera, null, {
			clipSpheres: viewer.scene.volumes.filter(v => v.isSphereVolume),
		});

		// render scene
		renderer.render(viewer.scene.scene, camera);

		viewer.dispatchEvent({type: "render.pass.scene", viewer: viewer});

		if(viewer.clippingTool){
			viewer.clippingTool.update();
			renderer.render(viewer.clippingTool.sceneMarker, viewer.scene.cameraScreenSpace);
			renderer.render(viewer.clippingTool.sceneVolume, camera);
		}

		if(viewer.controls){
			renderer.render(viewer.controls.sceneControls, camera);
		}

		renderer.clearDepth();

		// Transform gizmo overlay: `update()` binds it to the current
		// `InputHandler` selection and sizes the handles; the `render()` call
		// is what actually draws them (without it a selected volume / clip
		// volume shows no move/scale/rotate handles). Mirrors `EDLRenderer`.
		if(viewer.transformationTool){
			viewer.transformationTool.update();
			renderer.render(viewer.transformationTool.scene, camera);
		}

		viewer.dispatchEvent({type: "render.pass.perspective_overlay", viewer: viewer});

		viewer.dispatchEvent({type: "render.pass.end", viewer: viewer});
	}

}
