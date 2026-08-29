import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import {tweens} from "../utils/tweens.js";
import {ClipTask, ClipMethod, CameraMode, LengthUnits, ElevationGradientRepeat} from "./defines.js";
import {Renderer} from "./renderers/Renderer.js";
import {PotreeRenderer} from "./renderers/PotreeRenderer.js";
import {EDLRenderer} from "./renderers/EDLRenderer.js";
import {HQSplatRenderer} from "./renderers/HQSplatRenderer.js";
import {Scene} from "./Scene.js";
import {NavigationCube} from "./NavigationCube.js";
import {Features} from "./Features.js";
import {EventDispatcher} from "./EventDispatcher.js";
import {zoomTo} from "./camera-utils.js";
import {ClassificationScheme} from "../materials/ClassificationScheme.js";
import {loadSkybox} from "../utils/texture.js";
import {getParameterByName} from "../utils/misc.js";
import {updatePointClouds} from "../loaders/updateVisibility.js";

import {InputHandler} from "../navigation/InputHandler.js";
import {OrbitControls} from "../navigation/OrbitControls.js";
import {FirstPersonControls} from "../navigation/FirstPersonControls.js";
import {EarthControls} from "../navigation/EarthControls.js";
import {DeviceOrientationControls} from "../navigation/DeviceOrientationControls.js";
import {VRControls} from "../navigation/VRControls.js";

/**
 * Headless potree viewer: owns the WebGL renderer, the point-cloud render
 * pipeline, the active `Scene`/`View`, and the navigation controls. Takes a
 * plain `<canvas>`-hosting element - no DOM scaffolding is created beyond
 * the canvas itself, and there is no bundled UI (sidebar, minimap, VR
 * button, annotation popups, project loading dialogs, etc.) - build that
 * layer in the consuming application on top of this class's events and API.
 *
 * `args.resourcePath`, if given, is used to load the navigation cube face
 * textures and (when `setBackground('skybox')` is used) the skybox images.
 */
export class Viewer extends EventDispatcher{

	constructor(domElement, args = {}){
		super();

		this.renderArea = domElement;

		this.onVrListeners = [];

		this.pointCloudLoadedCallback = args.onPointCloudLoaded || function(){};
		this.resourcePath = args.resourcePath || null;

		this.server = null;

		this.fov = 60;
		this.isFlipYZ = false;
		this.useDEMCollisions = false;
		this.generateDEM = false;
		this.minNodeSize = 30;
		this.edlStrength = 1.0;
		this.edlRadius = 1.4;
		this.edlOpacity = 1.0;
		this.useEDL = false;
		this.useHQ = false;
		this.description = "";

		this.classifications = ClassificationScheme.DEFAULT;

		this.moveSpeed = 10;

		this.lengthUnit = LengthUnits.METER;
		this.lengthUnitDisplay = LengthUnits.METER;

		this.showBoundingBox = false;
		this.showAnnotations = true;
		this.freeze = false;
		this.clipTask = ClipTask.HIGHLIGHT;
		this.clipMethod = ClipMethod.INSIDE_ANY;

		this.elevationGradientRepeat = ElevationGradientRepeat.CLAMP;

		this.filterReturnNumberRange = [0, 7];
		this.filterNumberOfReturnsRange = [0, 7];
		this.filterGPSTimeRange = [-Infinity, Infinity];
		this.filterPointSourceIDRange = [0, 65535];

		this.pointBudget = 1 * 1000 * 1000;

		// debug/profiling switches, off by default
		this.measureTimings = false;
		this.debug = {};

		this.potreeRenderer = null;
		this.edlRenderer = null;
		this.hqRenderer = null;
		this.pRenderer = null;

		this.sceneVR = null;
		this.overlay = null;
		this.overlayCamera = null;

		this.inputHandler = null;
		this.controls = null;

		// tools/modules attach themselves here in later phases; core only
		// guarantees `navigationCube` (pure three.js, no tool dependencies).
		this.clippingTool = null;
		this.transformationTool = null;
		this.navigationCube = null;

		this.skybox = null;
		this.clock = new THREE.Clock();
		this.background = null;

		this.initThree();

		{
			let canvas = this.renderer.domElement;
			canvas.addEventListener("webglcontextlost", (e) => {
				console.error("WebGL context lost", e);
				this.dispatchEvent({type: "webglcontextlost", event: e});
			}, false);
		}

		{
			this.overlay = new THREE.Scene();
			this.overlayCamera = new THREE.OrthographicCamera(
				0, 1,
				1, 0,
				-1000, 1000
			);
		}

		this.pRenderer = new Renderer(this.renderer);

		{
			let near = 2.5;
			let far = 10.0;

			this.shadowTestCam = new THREE.PerspectiveCamera(90, 1, near, far);
			this.shadowTestCam.position.set(3.50, -2.80, 8.561);
			this.shadowTestCam.lookAt(new THREE.Vector3(0, 0, 4.87));
		}

		let scene = new Scene();

		this.sceneVR = new THREE.Scene();

		this.setScene(scene);

		{
			this.inputHandler = new InputHandler(this);
			this.inputHandler.setScene(this.scene);

			this.navigationCube = new NavigationCube(this);
			this.navigationCube.visible = false;

			this.createControls();

			let onPointcloudAdded = (e) => {
				if(this.scene.pointclouds.length === 1){
					let speed = e.pointcloud.boundingBox.getSize(new THREE.Vector3()).length();
					speed = speed / 5;
					this.setMoveSpeed(speed);
				}
			};

			let onVolumeRemoved = (e) => {
				this.inputHandler.deselect(e.volume);
			};

			this.addEventListener('scene_changed', (e) => {
				this.inputHandler.setScene(e.scene);
				this.clippingTool?.setScene(this.scene);

				if(!e.scene.hasEventListener("pointcloud_added", onPointcloudAdded)){
					e.scene.addEventListener("pointcloud_added", onPointcloudAdded);
				}

				if(!e.scene.hasEventListener("volume_removed", onPointcloudAdded)){
					e.scene.addEventListener("volume_removed", onVolumeRemoved);
				}
			});

			this.scene.addEventListener("volume_removed", onVolumeRemoved);
			this.scene.addEventListener('pointcloud_added', onPointcloudAdded);
		}

		{ // set defaults
			this.setFOV(60);
			this.setEDLEnabled(false);
			this.setEDLRadius(1.4);
			this.setEDLStrength(0.4);
			this.setEDLOpacity(1.0);
			this.setClipTask(ClipTask.HIGHLIGHT);
			this.setClipMethod(ClipMethod.INSIDE_ANY);
			this.setPointBudget(1 * 1000 * 1000);
			this.setShowBoundingBox(false);
			this.setFreeze(false);
			this.setControls(this.orbitControls);
			this.setBackground('gradient');

			this.scaleFactor = 1;

			this.loadSettingsFromURL();
		}

		this.renderer.setAnimationLoop(this.loop.bind(this));
	}

	onCrash(error){
		console.error(error);

		this.dispatchEvent({type: "crash", error: error});

		throw error;
	}

	// ------------------------------------------------------------------------------------
	// Viewer API
	// ------------------------------------------------------------------------------------

	setScene(scene){
		if(scene === this.scene){
			return;
		}

		let oldScene = this.scene;
		this.scene = scene;

		this.dispatchEvent({
			type: 'scene_changed',
			oldScene: oldScene,
			scene: scene
		});
	}

	setControls(controls){
		if(controls !== this.controls){
			if(this.controls){
				this.controls.enabled = false;
				this.inputHandler.removeInputListener(this.controls);
			}

			this.controls = controls;
			this.controls.enabled = true;
			this.inputHandler.addInputListener(this.controls);
		}
	}

	getControls(){
		if(this.renderer.xr.isPresenting){
			return this.vrControls;
		}

		return this.controls;
	}

	getMinNodeSize(){
		return this.minNodeSize;
	}

	setMinNodeSize(value){
		if(this.minNodeSize !== value){
			this.minNodeSize = value;
			this.dispatchEvent({'type': 'minnodesize_changed', 'viewer': this});
		}
	}

	getBackground(){
		return this.background;
	}

	setBackground(bg){
		if(this.background === bg){
			return;
		}

		if(bg === "skybox"){
			if(this.resourcePath){
				this.skybox = loadSkybox(new URL(`${this.resourcePath}/textures/skybox2/`).href);
			}else{
				console.warn("Viewer.setBackground('skybox') requires the `resourcePath` constructor option.");
			}
		}

		this.background = bg;
		this.dispatchEvent({'type': 'background_changed', 'viewer': this});
	}

	setDescription(value){
		this.description = value;
	}

	getDescription(){
		return this.description;
	}

	setShowBoundingBox(value){
		if(this.showBoundingBox !== value){
			this.showBoundingBox = value;
			this.dispatchEvent({'type': 'show_boundingbox_changed', 'viewer': this});
		}
	}

	getShowBoundingBox(){
		return this.showBoundingBox;
	}

	setMoveSpeed(value){
		if(this.moveSpeed !== value){
			this.moveSpeed = value;
			this.dispatchEvent({'type': 'move_speed_changed', 'viewer': this, 'speed': value});
		}
	}

	getMoveSpeed(){
		return this.moveSpeed;
	}

	setWeightClassification(w){
		for(let i = 0; i < this.scene.pointclouds.length; i++){
			this.scene.pointclouds[i].material.weightClassification = w;
			this.dispatchEvent({'type': 'attribute_weights_changed' + i, 'viewer': this});
		}
	}

	setFreeze(value){
		value = Boolean(value);
		if(this.freeze !== value){
			this.freeze = value;
			this.dispatchEvent({'type': 'freeze_changed', 'viewer': this});
		}
	}

	getFreeze(){
		return this.freeze;
	}

	getClipTask(){
		return this.clipTask;
	}

	getClipMethod(){
		return this.clipMethod;
	}

	setClipTask(value){
		if(this.clipTask !== value){
			this.clipTask = value;

			this.dispatchEvent({
				type: "cliptask_changed",
				viewer: this});
		}
	}

	setClipMethod(value){
		if(this.clipMethod !== value){
			this.clipMethod = value;

			this.dispatchEvent({
				type: "clipmethod_changed",
				viewer: this});
		}
	}

	setElevationGradientRepeat(value){
		if(this.elevationGradientRepeat !== value){
			this.elevationGradientRepeat = value;

			this.dispatchEvent({
				type: "elevation_gradient_repeat_changed",
				viewer: this});
		}
	}

	setPointBudget(value){
		value = parseInt(value);
		if(this.pointBudget !== value){
			this.pointBudget = value;
			this.dispatchEvent({'type': 'point_budget_changed', 'viewer': this});
		}
	}

	getPointBudget(){
		return this.pointBudget;
	}

	setShowAnnotations(value){
		if(this.showAnnotations !== value){
			this.showAnnotations = value;
			this.dispatchEvent({'type': 'show_annotations_changed', 'viewer': this});
		}
	}

	getShowAnnotations(){
		return this.showAnnotations;
	}

	setDEMCollisionsEnabled(value){
		if(this.useDEMCollisions !== value){
			this.useDEMCollisions = value;
			this.dispatchEvent({'type': 'use_demcollisions_changed', 'viewer': this});
		}
	}

	getDEMCollisionsEnabled(){
		return this.useDEMCollisions;
	}

	setEDLEnabled(value){
		value = Boolean(value) && Boolean(Features?.SHADER_EDL?.isSupported());

		if(this.useEDL !== value){
			this.useEDL = value;
			this.dispatchEvent({'type': 'use_edl_changed', 'viewer': this});
		}
	}

	getEDLEnabled(){
		return this.useEDL;
	}

	setEDLRadius(value){
		if(this.edlRadius !== value){
			this.edlRadius = value;
			this.dispatchEvent({'type': 'edl_radius_changed', 'viewer': this});
		}
	}

	getEDLRadius(){
		return this.edlRadius;
	}

	setEDLStrength(value){
		if(this.edlStrength !== value){
			this.edlStrength = value;
			this.dispatchEvent({'type': 'edl_strength_changed', 'viewer': this});
		}
	}

	getEDLStrength(){
		return this.edlStrength;
	}

	setEDLOpacity(value){
		if(this.edlOpacity !== value){
			this.edlOpacity = value;
			this.dispatchEvent({'type': 'edl_opacity_changed', 'viewer': this});
		}
	}

	getEDLOpacity(){
		return this.edlOpacity;
	}

	setFOV(value){
		if(this.fov !== value){
			this.fov = value;
			this.dispatchEvent({'type': 'fov_changed', 'viewer': this});
		}
	}

	getFOV(){
		return this.fov;
	}

	setClassifications(classifications){
		this.classifications = classifications;

		this.dispatchEvent({'type': 'classifications_changed', 'viewer': this});
	}

	setClassificationVisibility(key, value){
		if(!this.classifications[key]){
			this.classifications[key] = {visible: value, name: 'no name'};
			this.dispatchEvent({'type': 'classification_visibility_changed', 'viewer': this});
		}else if(this.classifications[key].visible !== value){
			this.classifications[key].visible = value;
			this.dispatchEvent({'type': 'classification_visibility_changed', 'viewer': this});
		}
	}

	toggleAllClassificationsVisibility(){
		let numVisible = 0;
		let numItems = 0;
		for(const key of Object.keys(this.classifications)){
			if(this.classifications[key].visible){
				numVisible++;
			}
			numItems++;
		}

		let visible = true;
		if(numVisible === numItems){
			visible = false;
		}

		let somethingChanged = false;

		for(const key of Object.keys(this.classifications)){
			if(this.classifications[key].visible !== visible){
				this.classifications[key].visible = visible;
				somethingChanged = true;
			}
		}

		if(somethingChanged){
			this.dispatchEvent({'type': 'classification_visibility_changed', 'viewer': this});
		}
	}

	setFilterReturnNumberRange(from, to){
		this.filterReturnNumberRange = [from, to];
		this.dispatchEvent({'type': 'filter_return_number_range_changed', 'viewer': this});
	}

	setFilterNumberOfReturnsRange(from, to){
		this.filterNumberOfReturnsRange = [from, to];
		this.dispatchEvent({'type': 'filter_number_of_returns_range_changed', 'viewer': this});
	}

	setFilterGPSTimeRange(from, to){
		this.filterGPSTimeRange = [from, to];
		this.dispatchEvent({'type': 'filter_gps_time_range_changed', 'viewer': this});
	}

	setFilterPointSourceIDRange(from, to){
		this.filterPointSourceIDRange = [from, to];
		this.dispatchEvent({'type': 'filter_point_source_id_range_changed', 'viewer': this});
	}

	setLengthUnit(value){
		switch(value){
			case 'm':
				this.lengthUnit = LengthUnits.METER;
				this.lengthUnitDisplay = LengthUnits.METER;
				break;
			case 'ft':
				this.lengthUnit = LengthUnits.FEET;
				this.lengthUnitDisplay = LengthUnits.FEET;
				break;
			case 'in':
				this.lengthUnit = LengthUnits.INCH;
				this.lengthUnitDisplay = LengthUnits.INCH;
				break;
		}

		this.dispatchEvent({'type': 'length_unit_changed', 'viewer': this, value: value});
	}

	setLengthUnitAndDisplayUnit(lengthUnitValue, lengthUnitDisplayValue){
		switch(lengthUnitValue){
			case 'm':
				this.lengthUnit = LengthUnits.METER;
				break;
			case 'ft':
				this.lengthUnit = LengthUnits.FEET;
				break;
			case 'in':
				this.lengthUnit = LengthUnits.INCH;
				break;
		}

		switch(lengthUnitDisplayValue){
			case 'm':
				this.lengthUnitDisplay = LengthUnits.METER;
				break;
			case 'ft':
				this.lengthUnitDisplay = LengthUnits.FEET;
				break;
			case 'in':
				this.lengthUnitDisplay = LengthUnits.INCH;
				break;
		}

		this.dispatchEvent({'type': 'length_unit_changed', 'viewer': this, value: lengthUnitValue});
	}

	zoomTo(node, factor, animationDuration = 0){
		let view = this.scene.view;

		let camera = this.scene.cameraP.clone();
		camera.rotation.copy(this.scene.cameraP.rotation);
		camera.rotation.order = "ZXY";
		camera.rotation.x = Math.PI / 2 + view.pitch;
		camera.rotation.z = view.yaw;
		camera.updateMatrix();
		camera.updateMatrixWorld();
		zoomTo(camera, node, factor);

		let bs;
		if(node.boundingSphere){
			bs = node.boundingSphere;
		}else if(node.geometry && node.geometry.boundingSphere){
			bs = node.geometry.boundingSphere;
		}else{
			bs = node.boundingBox.getBoundingSphere(new THREE.Sphere());
		}
		bs = bs.clone().applyMatrix4(node.matrixWorld);

		let startTarget = view.getPivot();
		let endTarget = bs.center;

		let easing = TWEEN.Easing.Quartic.Out;

		{ // animate camera position
			let pos = view.position.clone();
			let tween = new TWEEN.Tween(pos, tweens).to(camera.position.clone(), animationDuration);
			tween.easing(easing);

			tween.onUpdate(() => {
				view.position.copy(pos);
			});

			tween.start();
		}

		{ // animate camera target
			let target = startTarget.clone();
			let tween = new TWEEN.Tween(target, tweens).to(endTarget, animationDuration);
			tween.easing(easing);
			tween.onUpdate(() => {
				view.lookAt(target);
			});
			tween.onComplete(() => {
				view.lookAt(target);
				this.dispatchEvent({type: 'focusing_finished', target: this});
			});

			this.dispatchEvent({type: 'focusing_started', target: this});
			tween.start();
		}
	}

	getBoundingBox(pointclouds){
		return this.scene.getBoundingBox(pointclouds);
	}

	getGpsTimeExtent(){
		const range = [Infinity, -Infinity];

		for(const pointcloud of this.scene.pointclouds){
			const attributes = pointcloud.pcoGeometry.pointAttributes.attributes;
			const aGpsTime = attributes.find(a => a.name === "gps-time");

			if(aGpsTime){
				range[0] = Math.min(range[0], aGpsTime.range[0]);
				range[1] = Math.max(range[1], aGpsTime.range[1]);
			}
		}

		return range;
	}

	fitToScreen(factor = 1, animationDuration = 0){
		let box = this.getBoundingBox(this.scene.pointclouds);

		let node = new THREE.Object3D();
		/** @type {any} */ (node).boundingBox = box;

		this.zoomTo(node, factor, animationDuration);
		this.controls.stop();
	}

	toggleNavigationCube(){
		this.navigationCube.visible = !this.navigationCube.visible;
	}

	setView(view){
		if(!view) return;

		switch(view){
			case "F":
				this.setFrontView();
				break;
			case "B":
				this.setBackView();
				break;
			case "L":
				this.setLeftView();
				break;
			case "R":
				this.setRightView();
				break;
			case "U":
				this.setTopView();
				break;
			case "D":
				this.setBottomView();
				break;
		}
	}

	setTopView(){
		this.scene.view.yaw = 0;
		this.scene.view.pitch = -Math.PI / 2;

		this.fitToScreen();
	}

	setBottomView(){
		this.scene.view.yaw = -Math.PI;
		this.scene.view.pitch = Math.PI / 2;

		this.fitToScreen();
	}

	setFrontView(){
		this.scene.view.yaw = 0;
		this.scene.view.pitch = 0;

		this.fitToScreen();
	}

	setBackView(){
		this.scene.view.yaw = Math.PI;
		this.scene.view.pitch = 0;

		this.fitToScreen();
	}

	setLeftView(){
		this.scene.view.yaw = -Math.PI / 2;
		this.scene.view.pitch = 0;

		this.fitToScreen();
	}

	setRightView(){
		this.scene.view.yaw = Math.PI / 2;
		this.scene.view.pitch = 0;

		this.fitToScreen();
	}

	flipYZ(){
		this.isFlipYZ = !this.isFlipYZ;

		console.warn("Viewer.flipYZ() is not implemented.");
	}

	setCameraMode(mode){
		this.scene.cameraMode = mode;

		for(let pointcloud of this.scene.pointclouds){
			pointcloud.material.useOrthographicCamera = mode == CameraMode.ORTHOGRAPHIC;
		}
	}

	getProjection(){
		const pointcloud = this.scene.pointclouds[0];

		if(pointcloud){
			return pointcloud.projection;
		}

		return null;
	}

	loadSettingsFromURL(){
		if(getParameterByName("FOV")){
			this.setFOV(parseFloat(getParameterByName("FOV")));
		}

		if(getParameterByName("edlEnabled")){
			let enabled = getParameterByName("edlEnabled") === "true";
			this.setEDLEnabled(enabled);
		}

		if(getParameterByName('edlRadius')){
			this.setEDLRadius(parseFloat(getParameterByName('edlRadius')));
		}

		if(getParameterByName('edlStrength')){
			this.setEDLStrength(parseFloat(getParameterByName('edlStrength')));
		}

		if(getParameterByName('pointBudget')){
			this.setPointBudget(parseFloat(getParameterByName('pointBudget')));
		}

		if(getParameterByName('showBoundingBox')){
			let enabled = getParameterByName('showBoundingBox') === 'true';
			this.setShowBoundingBox(enabled);
		}

		if(getParameterByName('position')){
			let value = getParameterByName('position');
			value = value.replace('[', '').replace(']', '');
			let tokens = value.split(';');
			let x = parseFloat(tokens[0]);
			let y = parseFloat(tokens[1]);
			let z = parseFloat(tokens[2]);

			this.scene.view.position.set(x, y, z);
		}

		if(getParameterByName('target')){
			let value = getParameterByName('target');
			value = value.replace('[', '').replace(']', '');
			let tokens = value.split(';');
			let x = parseFloat(tokens[0]);
			let y = parseFloat(tokens[1]);
			let z = parseFloat(tokens[2]);

			this.scene.view.lookAt(new THREE.Vector3(x, y, z));
		}

		if(getParameterByName('background')){
			let value = getParameterByName('background');
			this.setBackground(value);
		}
	}

	// ------------------------------------------------------------------------------------
	// Viewer Internals
	// ------------------------------------------------------------------------------------

	createControls(){
		{ // create FIRST PERSON CONTROLS
			this.fpControls = new FirstPersonControls(this);
			this.fpControls.enabled = false;
			this.fpControls.addEventListener('start', () => this.dispatchEvent({type: 'controls_start'}));
			this.fpControls.addEventListener('end', () => this.dispatchEvent({type: 'controls_end'}));
		}

		{ // create ORBIT CONTROLS
			this.orbitControls = new OrbitControls(this);
			this.orbitControls.enabled = false;
			this.orbitControls.addEventListener('start', () => this.dispatchEvent({type: 'controls_start'}));
			this.orbitControls.addEventListener('end', () => this.dispatchEvent({type: 'controls_end'}));
		}

		{ // create EARTH CONTROLS
			this.earthControls = new EarthControls(this);
			this.earthControls.enabled = false;
			this.earthControls.addEventListener('start', () => this.dispatchEvent({type: 'controls_start'}));
			this.earthControls.addEventListener('end', () => this.dispatchEvent({type: 'controls_end'}));
		}

		{ // create DEVICE ORIENTATION CONTROLS
			this.deviceControls = new DeviceOrientationControls(this);
			this.deviceControls.enabled = false;
		}

		{ // create VR CONTROLS
			this.vrControls = new VRControls(this);
			this.vrControls.enabled = false;
		}
	}

	setServer(server){
		this.server = server;
	}

	initThree(){
		let width = this.renderArea.clientWidth;
		let height = this.renderArea.clientHeight;

		let contextAttributes = {
			alpha: true,
			depth: true,
			stencil: false,
			antialias: false,
			preserveDrawingBuffer: true,
			powerPreference: "high-performance",
		};

		let canvas = document.createElement("canvas");

		// three.js has required a WebGL2 context since r163; `Renderer`
		// (core/renderers/Renderer.js) also relies on WebGL2-only APIs
		// (createVertexArray/bindVertexArray, UBOs) with no WebGL1 fallback.
		let context = canvas.getContext('webgl2', contextAttributes);

		this.renderer = new THREE.WebGLRenderer({
			alpha: true,
			premultipliedAlpha: false,
			canvas: canvas,
			context: /** @type {WebGL2RenderingContext} */ (context)});
		this.renderer.sortObjects = false;
		this.renderer.setSize(width, height);
		this.renderer.autoClear = false;
		this.renderArea.appendChild(this.renderer.domElement);
		this.renderer.domElement.tabIndex = 2222;
		this.renderer.domElement.style.position = 'absolute';
		this.renderer.domElement.addEventListener('mousedown', () => {
			this.renderer.domElement.focus();
		});

		// enable frag_depth extension for the interpolation shader, if available
		let gl = this.renderer.getContext();
		gl.getExtension('EXT_color_buffer_float');
	}

	updateMaterialDefaults(pointcloud){
		// PROBLEM STATEMENT:
		// * [min, max] of intensity, source id, etc. are computed as point clouds are loaded
		// * the point cloud material won't know the range it should use until some data is loaded
		// * users can modify the range at runtime, but sensible default ranges should be
		//   applied even if no GUI is present
		// * display ranges shouldn't suddenly change even if the actual range changes over time.

		const material = pointcloud.material;

		const attIntensity = pointcloud.getAttribute("intensity");

		if(attIntensity != null && material.intensityRange[0] === Infinity){
			material.intensityRange = [...attIntensity.range];
		}
	}

	update(delta, timestamp){
		if(this.measureTimings) performance.mark("update-start");

		this.dispatchEvent({
			type: 'update_start',
			delta: delta,
			timestamp: timestamp});

		const scene = this.scene;
		const camera = scene.getActiveCamera();
		const visiblePointClouds = this.scene.pointclouds.filter(pc => pc.visible);

		this.pointLoadLimit = this.pointBudget * 2;

		const lTarget = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1000));
		this.scene.directionalLight.position.copy(camera.position);
		this.scene.directionalLight.lookAt(lTarget);

		for(let pointcloud of visiblePointClouds){
			pointcloud.showBoundingBox = this.showBoundingBox;
			pointcloud.generateDEM = this.generateDEM;
			pointcloud.minimumNodePixelSize = this.minNodeSize;

			let material = pointcloud.material;

			material.uniforms.uFilterReturnNumberRange.value = this.filterReturnNumberRange;
			material.uniforms.uFilterNumberOfReturnsRange.value = this.filterNumberOfReturnsRange;
			material.uniforms.uFilterGPSTimeClipRange.value = this.filterGPSTimeRange;
			material.uniforms.uFilterPointSourceIDClipRange.value = this.filterPointSourceIDRange;

			material.classification = this.classifications;
			material.recomputeClassification();

			this.updateMaterialDefaults(pointcloud);
		}

		{
			if(this.showBoundingBox){
				let bbRoot = this.scene.scene.getObjectByName("potree_bounding_box_root");
				if(!bbRoot){
					let node = new THREE.Object3D();
					node.name = "potree_bounding_box_root";
					this.scene.scene.add(node);
					bbRoot = node;
				}

				let visibleBoxes = [];
				for(let pointcloud of this.scene.pointclouds){
					for(let node of pointcloud.visibleNodes.filter(vn => vn.boundingBoxNode !== undefined)){
						let box = node.boundingBoxNode;
						visibleBoxes.push(box);
					}
				}

				bbRoot.children = visibleBoxes;
			}
		}

		if(!this.freeze){
			const result = updatePointClouds(visiblePointClouds, camera, this.renderer, {
				pointBudget: this.pointBudget,
				pointLoadLimit: this.pointLoadLimit,
			});

			const campos = camera.position;
			let closestImage = Infinity;
			for(const images of this.scene.orientedImages){
				for(const image of images.images){
					const distance = image.mesh.position.distanceTo(campos);

					closestImage = Math.min(closestImage, distance);
				}
			}

			if(result.lowestSpacing !== Infinity){
				let near = result.lowestSpacing * 10.0;
				let far = -this.getBoundingBox().applyMatrix4(camera.matrixWorldInverse).min.z;

				far = Math.max(far * 1.5, 10000);
				near = Math.min(100.0, Math.max(0.01, near));
				near = Math.min(near, closestImage);
				far = Math.max(far, near + 10000);

				if(near === Infinity){
					near = 0.1;
				}

				camera.near = near;
				camera.far = far;
			}

			if(this.scene.cameraMode == CameraMode.ORTHOGRAPHIC){
				camera.near = -camera.far;
			}
		}

		this.scene.cameraP.fov = this.fov;

		let controls = this.getControls();
		if(controls === this.deviceControls){
			this.controls.setScene(scene);
			this.controls.update(delta);

			this.scene.cameraP.position.copy(scene.view.position);
			this.scene.cameraO.position.copy(scene.view.position);
		}else if(controls !== null){
			controls.setScene(scene);
			controls.update(delta);

			this.scene.cameraP.position.copy(scene.view.position);
			this.scene.cameraP.rotation.order = "ZXY";
			this.scene.cameraP.rotation.x = Math.PI / 2 + this.scene.view.pitch;
			this.scene.cameraP.rotation.z = this.scene.view.yaw;

			this.scene.cameraO.position.copy(scene.view.position);
			this.scene.cameraO.rotation.order = "ZXY";
			this.scene.cameraO.rotation.x = Math.PI / 2 + this.scene.view.pitch;
			this.scene.cameraO.rotation.z = this.scene.view.yaw;
		}

		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

		{
			if(this._previousCamera === undefined){
				this._previousCamera = this.scene.getActiveCamera().clone();
				this._previousCamera.rotation.copy(this.scene.getActiveCamera().rotation);
			}

			if(!this._previousCamera.matrixWorld.equals(camera.matrixWorld)){
				this.dispatchEvent({
					type: "camera_changed",
					previous: this._previousCamera,
					camera: camera
				});
			}else if(!this._previousCamera.projectionMatrix.equals(camera.projectionMatrix)){
				this.dispatchEvent({
					type: "camera_changed",
					previous: this._previousCamera,
					camera: camera
				});
			}

			this._previousCamera = this.scene.getActiveCamera().clone();
			this._previousCamera.rotation.copy(this.scene.getActiveCamera().rotation);
		}

		{ // update clip boxes
			let boxes = [];

			// volumes with clipping enabled - Volume classes (Phase 4) set
			// `isBoxVolume`/`isSphereVolume` on themselves, three.js-style,
			// so core doesn't need to import the tools module to filter them.
			boxes.push(...this.scene.volumes.filter(v => (v.clip && v.isBoxVolume)));

			// profile segments
			for(let profile of this.scene.profiles){
				boxes.push(...profile.boxes);
			}

			// Needed for .invert(), pre-empt a determinant of 0, see potree#815 / #816
			let degenerate = (box) => box.matrixWorld.determinant() !== 0;

			let clipBoxes = boxes.filter(degenerate).map(box => {
				box.updateMatrixWorld();

				let boxInverse = box.matrixWorld.clone().invert();
				let boxPosition = box.getWorldPosition(new THREE.Vector3());

				return {box: box, inverse: boxInverse, position: boxPosition};
			});

			let clipPolygons = this.scene.polygonClipVolumes.filter(vol => vol.initialized);

			// set clip volumes in material
			for(let pointcloud of visiblePointClouds){
				pointcloud.material.setClipBoxes(clipBoxes);
				pointcloud.material.setClipPolygons(clipPolygons, this.clippingTool?.maxPolygonVertices);
				pointcloud.material.clipTask = this.clipTask;
				pointcloud.material.clipMethod = this.clipMethod;
			}
		}

		{
			for(let pointcloud of visiblePointClouds){
				pointcloud.material.elevationGradientRepeat = this.elevationGradientRepeat;
			}
		}

		if(this.navigationCube){
			this.navigationCube.update(camera.rotation);
		}

		tweens.update(timestamp);

		this.dispatchEvent({
			type: 'update',
			delta: delta,
			timestamp: timestamp});

		if(this.measureTimings){
			performance.mark("update-end");
			performance.measure("update", "update-start", "update-end");
		}
	}

	getPRenderer(){
		if(this.useHQ){
			if(!this.hqRenderer){
				this.hqRenderer = new HQSplatRenderer(this);
			}
			this.hqRenderer.useEDL = this.useEDL;

			return this.hqRenderer;
		}else{
			if(this.useEDL && Features.SHADER_EDL.isSupported()){
				if(!this.edlRenderer){
					this.edlRenderer = new EDLRenderer(this);
				}

				return this.edlRenderer;
			}else{
				if(!this.potreeRenderer){
					this.potreeRenderer = new PotreeRenderer(this);
				}

				return this.potreeRenderer;
			}
		}
	}

	renderVR(){
		let renderer = this.renderer;

		renderer.setClearColor(0x550000, 0);
		renderer.clear();

		let xr = renderer.xr;
		let xrCameras = xr.getCamera();

		if(xrCameras.cameras.length !== 2){
			return;
		}

		let makeCam = this.vrControls.getCamera.bind(this.vrControls);

		{ // clear framebuffer
			if(this.background === "skybox"){
				renderer.setClearColor(0xff0000, 1);
			}else if(this.background === "gradient"){
				renderer.setClearColor(0x112233, 1);
			}else if(this.background === "black"){
				renderer.setClearColor(0x000000, 1);
			}else if(this.background === "white"){
				renderer.setClearColor(0xFFFFFF, 1);
			}else{
				renderer.setClearColor(0x000000, 0);
			}

			renderer.clear();
		}

		// render background
		if(this.background === "skybox"){
			let {skybox} = this;

			let cam = makeCam();
			skybox.camera.rotation.copy(cam.rotation);
			skybox.camera.fov = cam.fov;
			skybox.camera.aspect = cam.aspect;

			let dbgNode = skybox.parent;
			dbgNode.rotation.x = Math.PI / 2;

			dbgNode.updateMatrix();
			dbgNode.updateMatrixWorld();

			skybox.camera.updateMatrix();
			skybox.camera.updateMatrixWorld();
			skybox.camera.updateProjectionMatrix();

			renderer.render(skybox.scene, skybox.camera);
		}

		this.renderer.xr.getSession().updateRenderState({
			depthNear: 0.1,
			depthFar: 10000
		});

		let cam = null;
		let view = null;

		{ // render world scene
			cam = makeCam();
			cam.position.z -= 0.8 * cam.scale.x;
			cam.parent = null;
			cam.near = this.scene.getActiveCamera().near;
			cam.far = this.scene.getActiveCamera().far;
			cam.updateMatrix();
			cam.updateMatrixWorld();

			this.scene.scene.updateMatrix();
			this.scene.scene.updateMatrixWorld();
			this.scene.scene.matrixAutoUpdate = false;

			let camWorld = cam.matrixWorld.clone();
			view = camWorld.clone().invert();
			this.scene.scene.matrix.copy(view);
			this.scene.scene.matrixWorld.copy(view);

			cam.matrix.identity();
			cam.matrixWorld.identity();
			cam.matrixWorldInverse.identity();

			renderer.render(this.scene.scene, cam);

			this.scene.scene.matrixWorld.identity();
		}

		for(let pointcloud of this.scene.pointclouds){
			let viewport = xrCameras.cameras[0].viewport;

			pointcloud.material.useEDL = false;
			pointcloud.screenHeight = viewport.height;
			pointcloud.screenWidth = viewport.width;
		}

		// render point clouds
		for(let xrCamera of xrCameras.cameras){
			let v = xrCamera.viewport;
			renderer.setViewport(v.x, v.y, v.width, v.height);

			{ // estimate VR fov
				let proj = xrCamera.projectionMatrix;
				let inv = proj.clone().invert();

				let p1 = new THREE.Vector4(0, 1, -1, 1).applyMatrix4(inv);
				let rad = p1.y;
				let fov = 180 * (rad / Math.PI);

				xrCamera.fov = fov;
			}

			for(let pointcloud of this.scene.pointclouds){
				const {material} = pointcloud;
				material.useEDL = false;
			}

			let vrWorld = view.clone().invert();
			vrWorld.multiply(xrCamera.matrixWorld);
			let vrView = vrWorld.clone().invert();

			this.pRenderer.render(this.scene.scenePointCloud, xrCamera, null, {
				viewOverride: vrView,
			});
		}

		{ // render VR scene
			let cam2 = makeCam();
			cam2.parent = null;

			renderer.render(this.sceneVR, cam2);
		}

		renderer.resetState();
	}

	renderDefault(){
		let pRenderer = this.getPRenderer();

		{ // resize
			const width = this.scaleFactor * this.renderArea.clientWidth;
			const height = this.scaleFactor * this.renderArea.clientHeight;

			this.renderer.setSize(width, height);
			const aspect = width / height;

			const scene = this.scene;

			scene.cameraP.aspect = aspect;
			scene.cameraP.updateProjectionMatrix();

			let frustumScale = this.scene.view.radius;
			scene.cameraO.left = -frustumScale;
			scene.cameraO.right = frustumScale;
			scene.cameraO.top = frustumScale * 1 / aspect;
			scene.cameraO.bottom = -frustumScale * 1 / aspect;
			scene.cameraO.updateProjectionMatrix();

			scene.cameraScreenSpace.top = 1 / aspect;
			scene.cameraScreenSpace.bottom = -1 / aspect;
			scene.cameraScreenSpace.updateProjectionMatrix();
		}

		pRenderer.clear();

		pRenderer.render(this.renderer);
		this.renderer.render(this.overlay, this.overlayCamera);
	}

	render(){
		if(this.measureTimings) performance.mark("render-start");

		try{
			const vrActive = this.renderer.xr.isPresenting;

			if(vrActive){
				this.renderVR();
			}else{
				this.renderDefault();
			}
		}catch(e){
			this.onCrash(e);
		}

		if(this.measureTimings){
			performance.mark("render-end");
			performance.measure("render", "render-start", "render-end");
		}
	}

	resolveTimings(timestamp){
		if(this.measureTimings){
			if(!this.toggle){
				this.toggle = timestamp;
			}
			let duration = timestamp - this.toggle;
			if(duration > 1000.0){
				let measures = performance.getEntriesByType("measure");

				let names = new Set();
				for(let measure of measures){
					names.add(measure.name);
				}

				let groups = new Map();
				for(let name of names){
					groups.set(name, {
						measures: [],
						sum: 0,
						n: 0,
						min: Infinity,
						max: -Infinity
					});
				}

				for(let measure of measures){
					let group = groups.get(measure.name);
					group.measures.push(measure);
					group.sum += measure.duration;
					group.n++;
					group.min = Math.min(group.min, measure.duration);
					group.max = Math.max(group.max, measure.duration);
				}

				for(let [name, group] of groups){
					group.mean = group.sum / group.n;
					group.measures.sort((a, b) => a.duration - b.duration);

					if(group.n === 1){
						group.median = group.measures[0].duration;
					}else if(group.n > 1){
						group.median = group.measures[Math.floor(group.n / 2)].duration;
					}
				}

				let cn = Array.from(names).reduce((a, i) => Math.max(a, i.length), 0) + 5;
				let cmin = 10;
				let cmed = 10;
				let cmax = 10;
				let csam = 6;

				let message = ` ${"NAME".padEnd(cn)} |`
					+ ` ${"MIN".padStart(cmin)} |`
					+ ` ${"MEDIAN".padStart(cmed)} |`
					+ ` ${"MAX".padStart(cmax)} |`
					+ ` ${"SAMPLES".padStart(csam)} \n`;
				message += ` ${"-".repeat(message.length)}\n`;

				let sortedNames = Array.from(names).sort();
				for(let name of sortedNames){
					let group = groups.get(name);
					let min = group.min.toFixed(3);
					let median = group.median.toFixed(3);
					let max = group.max.toFixed(3);
					let n = group.n;

					message += ` ${name.padEnd(cn)} |`
						+ ` ${min.padStart(cmin)} |`
						+ ` ${median.padStart(cmed)} |`
						+ ` ${max.padStart(cmax)} |`
						+ ` ${n.toString().padStart(csam)}\n`;
				}
				message += `\n`;
				console.log(message);

				performance.clearMarks();
				performance.clearMeasures();
				this.toggle = timestamp;
			}
		}
	}

	loop(timestamp){
		if(this.measureTimings){
			performance.mark("loop-start");
		}

		this.update(this.clock.getDelta(), timestamp);
		this.render();

		if(this.measureTimings){
			performance.mark("loop-end");
			performance.measure("loop", "loop-start", "loop-end");
		}

		this.resolveTimings(timestamp);

		this.frameNumber = (this.frameNumber ?? 0) + 1;
	}

}
