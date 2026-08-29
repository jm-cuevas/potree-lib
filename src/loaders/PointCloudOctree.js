import * as THREE from "three";
import {PointCloudTree, PointCloudTreeNode} from "../core/PointCloudTree.js";
import {PointCloudOctreeGeometryNode} from "./PointCloudOctreeGeometry.js";
import {computeTransformedBoundingBox} from "../utils/geometry.js";
import {PointCloudMaterial} from "../materials/PointCloudMaterial.js";
import {PointShape, ClipTask} from "../core/defines.js";

/**
 * `ProfileRequest` lives in the `tools/profile` subpath (it is only needed
 * when the Profile tool is in use) and would otherwise pull the whole tools
 * bundle into `loaders`. It self-registers here when
 * `tools/profile/ProfileRequest.js` is imported; until then
 * `getPointsInProfile()` / `getProfile()` throw a clear error.
 */
let ProfileRequest = null;

export function registerProfileRequest(cls){
	ProfileRequest = cls;
}

export class PointCloudOctreeNode extends PointCloudTreeNode {

	constructor() {
		super();

		this.children = [];
		this.sceneNode = null;
		this.octree = null;
		// set by PointCloudOctree.toTreeNode() once the node is realized
		this.geometryNode = null;
		this.pointcloud = null;
		this.pcIndex = undefined;
	}

	getNumPoints() {
		return this.geometryNode.numPoints;
	}

	isLoaded() {
		return true;
	}

	isTreeNode() {
		return true;
	}

	isGeometryNode() {
		return false;
	}

	getLevel() {
		return this.geometryNode.level;
	}

	getBoundingSphere() {
		return this.geometryNode.boundingSphere;
	}

	getBoundingBox() {
		return this.geometryNode.boundingBox;
	}

	getChildren() {
		let children = [];

		for (let i = 0; i < 8; i++) {
			if (this.children[i]) {
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getPointsInBox(boxNode) {
		if (!this.sceneNode) {
			return null;
		}

		let buffer = this.geometryNode.buffer;

		let posOffset = buffer.offset("position");
		let stride = buffer.stride;
		let view = new DataView(buffer.data);

		let worldToBox = boxNode.matrixWorld.clone().invert();
		let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, this.sceneNode.matrixWorld);

		let inBox = [];

		let pos = new THREE.Vector4();
		for (let i = 0; i < buffer.numElements; i++) {
			let x = view.getFloat32(i * stride + posOffset + 0, true);
			let y = view.getFloat32(i * stride + posOffset + 4, true);
			let z = view.getFloat32(i * stride + posOffset + 8, true);

			pos.set(x, y, z, 1);
			pos.applyMatrix4(objectToBox);

			if (-0.5 < pos.x && pos.x < 0.5) {
				if (-0.5 < pos.y && pos.y < 0.5) {
					if (-0.5 < pos.z && pos.z < 0.5) {
						pos.set(x, y, z, 1).applyMatrix4(this.sceneNode.matrixWorld);
						inBox.push(new THREE.Vector3(pos.x, pos.y, pos.z));
					}
				}
			}
		}

		return inBox;
	}

	get name() {
		return this.geometryNode.name;
	}

}

export class PointCloudOctree extends PointCloudTree {

	constructor(geometry, material) {
		super();

		this.pointBudget = Infinity;
		// populated by the render pipeline (core/renderers/Renderer.js) each frame
		this.visibleNodeTextureOffsets = null;
		this.pcoGeometry = geometry;
		this.boundingBox = this.pcoGeometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());
		this.material = material || new PointCloudMaterial();
		this.visiblePointsTarget = 2 * 1000 * 1000;
		this.minimumNodePixelSize = 150;
		this.level = 0;
		this.position.copy(geometry.offset);
		this.updateMatrix();

		{
			let priorityQueue = ["rgba", "rgb", "intensity", "classification"];
			let selected = "rgba";

			for (let attributeName of priorityQueue) {
				let attribute = this.pcoGeometry.pointAttributes.attributes.find(a => a.name === attributeName);

				if (!attribute) {
					continue;
				}

				let min = attribute.range[0].constructor.name === "Array" ? attribute.range[0] : [attribute.range[0]];
				let max = attribute.range[1].constructor.name === "Array" ? attribute.range[1] : [attribute.range[1]];

				let range_min = new THREE.Vector3(...min);
				let range_max = new THREE.Vector3(...max);
				let range = range_min.distanceTo(range_max);

				if (range === 0) {
					continue;
				}

				selected = attributeName;
				break;
			}

			this.material.activeAttributeName = selected;
		}

		this.showBoundingBox = false;
		this.boundingBoxNodes = [];
		this.loadQueue = [];
		this.visibleBounds = new THREE.Box3();
		this.visibleNodes = [];
		this.visibleGeometry = [];
		this.generateDEM = false;
		this.profileRequests = [];
		this.name = '';
		this._visible = true;

		{
			let box = [this.pcoGeometry.tightBoundingBox, this.getBoundingBoxWorld()]
				.find(v => v !== undefined);

			this.updateMatrixWorld(true);
			box = computeTransformedBoundingBox(box, this.matrixWorld);

			let bMin = box.min.z;
			let bMax = box.max.z;
			this.material.heightMin = bMin;
			this.material.heightMax = bMax;
		}

		// TODO read projection from file instead
		this.projection = geometry.projection;
		this.fallbackProjection = geometry.fallbackProjection;

		this.root = this.pcoGeometry.root;
	}

	setName(name) {
		if (this.name !== name) {
			this.name = name;
			this.dispatchEvent({type: 'name_changed', name: name, pointcloud: this});
		}
	}

	getName() {
		return this.name;
	}

	getAttribute(name) {
		const attribute = this.pcoGeometry.pointAttributes.attributes.find(a => a.name === name);

		return attribute || null;
	}

	getAttributes() {
		return this.pcoGeometry.pointAttributes;
	}

	toTreeNode(geometryNode, parent) {
		let node = new PointCloudOctreeNode();

		let sceneNode = new THREE.Points(geometryNode.geometry, this.material);
		sceneNode.name = geometryNode.name;
		sceneNode.position.copy(geometryNode.boundingBox.min);
		sceneNode.frustumCulled = false;
		sceneNode.onBeforeRender = (_this, scene, camera, geometry, rawMaterial, group) => {
			// reaches into WebGLRenderer's internal per-material compiled-program
			// cache (material.program), not part of three.js's public Material type
			const material = /** @type {any} */ (rawMaterial);
			if (material.program) {
				_this.getContext().useProgram(material.program.program);

				if (material.program.getUniforms().map.level) {
					let level = geometryNode.getLevel();
					material.uniforms.level.value = level;
					material.program.getUniforms().map.level.setValue(_this.getContext(), level);
				}

				if (this.visibleNodeTextureOffsets && material.program.getUniforms().map.vnStart) {
					let vnStart = this.visibleNodeTextureOffsets.get(node);
					material.uniforms.vnStart.value = vnStart;
					material.program.getUniforms().map.vnStart.setValue(_this.getContext(), vnStart);
				}

				if (material.program.getUniforms().map.pcIndex) {
					let i = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
					material.uniforms.pcIndex.value = i;
					material.program.getUniforms().map.pcIndex.setValue(_this.getContext(), i);
				}
			}
		};

		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.pointcloud = this;
		node.children = [];
		for (let i = 0; i < 8; i++) {
			node.children[i] = geometryNode.children[i];
		}

		if (!parent) {
			this.root = node;
			this.add(sceneNode);
		} else {
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.add(sceneNode);
			parent.children[childIndex] = node;
		}

		let disposeListener = function () {
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.remove(node.sceneNode);
			parent.children[childIndex] = geometryNode;
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);

		return node;
	}

	updateVisibleBounds() {
		let leafNodes = [];
		for (let i = 0; i < this.visibleNodes.length; i++) {
			let node = this.visibleNodes[i];
			let isLeaf = true;

			for (let j = 0; j < node.children.length; j++) {
				let child = node.children[j];
				if (child instanceof PointCloudOctreeNode) {
					isLeaf = isLeaf && !child.sceneNode.visible;
				} else if (child instanceof PointCloudOctreeGeometryNode) {
					isLeaf = true;
				}
			}

			if (isLeaf) {
				leafNodes.push(node);
			}
		}

		this.visibleBounds.min = new THREE.Vector3(Infinity, Infinity, Infinity);
		this.visibleBounds.max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
		for (let i = 0; i < leafNodes.length; i++) {
			let node = leafNodes[i];

			this.visibleBounds.expandByPoint(node.getBoundingBox().min);
			this.visibleBounds.expandByPoint(node.getBoundingBox().max);
		}
	}

	updateMaterial(material, visibleNodes, camera, renderer) {
		material.fov = camera.fov * (Math.PI / 180);
		material.screenWidth = renderer.domElement.clientWidth;
		material.screenHeight = renderer.domElement.clientHeight;
		material.spacing = this.pcoGeometry.spacing;
		material.near = camera.near;
		material.far = camera.far;
		material.uniforms.octreeSize.value = this.pcoGeometry.boundingBox.getSize(new THREE.Vector3()).x;
	}

	computeVisibilityTextureData(nodes, camera) {
		let data = new Uint8Array(nodes.length * 4);
		let visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and index, e.g. r, r0, r3, r4, r01, r07, r30, ...
		let sort = function (a, b) {
			let na = a.geometryNode.name;
			let nb = b.geometryNode.name;
			if (na.length !== nb.length) return na.length - nb.length;
			if (na < nb) return -1;
			if (na > nb) return 1;
			return 0;
		};
		nodes.sort(sort);

		let nodeMap = new Map();
		let offsetsToChild = new Array(nodes.length).fill(Infinity);

		for (let i = 0; i < nodes.length; i++) {
			let node = nodes[i];

			nodeMap.set(node.name, node);
			visibleNodeTextureOffsets.set(node, i);

			if (i > 0) {
				let index = parseInt(node.name.slice(-1));
				let parentName = node.name.slice(0, -1);
				let parent = nodeMap.get(parentName);
				let parentOffset = visibleNodeTextureOffsets.get(parent);

				let parentOffsetToChild = (i - parentOffset);

				offsetsToChild[parentOffset] = Math.min(offsetsToChild[parentOffset], parentOffsetToChild);

				data[parentOffset * 4 + 0] = data[parentOffset * 4 + 0] | (1 << index);
				data[parentOffset * 4 + 1] = (offsetsToChild[parentOffset] >> 8);
				data[parentOffset * 4 + 2] = (offsetsToChild[parentOffset] % 256);
			}

			let density = node.geometryNode.density;

			if (typeof density === "number" && !Number.isNaN(density)) {
				let lodOffset = Math.log2(density) / 2 - 1.5;

				let offsetUint8 = (lodOffset + 10) * 10;

				data[i * 4 + 3] = offsetUint8;
			} else {
				data[i * 4 + 3] = 100;
			}
		}

		return {
			data: data,
			offsets: visibleNodeTextureOffsets,
		};
	}

	nodeIntersectsProfile(node, profile) {
		let bbWorld = node.boundingBox.clone().applyMatrix4(this.matrixWorld);
		let bsWorld = bbWorld.getBoundingSphere(new THREE.Sphere());

		let intersects = false;

		for (let i = 0; i < profile.points.length - 1; i++) {
			let start = new THREE.Vector3(profile.points[i + 0].x, profile.points[i + 0].y, bsWorld.center.z);
			let end = new THREE.Vector3(profile.points[i + 1].x, profile.points[i + 1].y, bsWorld.center.z);

			let closest = new THREE.Line3(start, end).closestPointToPoint(bsWorld.center, true, new THREE.Vector3());
			let distance = closest.distanceTo(bsWorld.center);

			intersects = intersects || (distance < (bsWorld.radius + profile.width));
		}

		return intersects;
	}

	deepestNodeAt(position) {
		const toObjectSpace = this.matrixWorld.clone().invert();

		const objPos = position.clone().applyMatrix4(toObjectSpace);

		let current = this.root;
		while (true) {
			let containingChild = null;

			for (const child of current.children) {
				if (child !== undefined) {
					if (child.getBoundingBox().containsPoint(objPos)) {
						containingChild = child;
					}
				}
			}

			if (containingChild !== null && containingChild instanceof PointCloudOctreeNode) {
				current = containingChild;
			} else {
				break;
			}
		}

		return current;
	}

	nodesOnRay(nodes, ray) {
		let nodesOnRay = [];

		let _ray = ray.clone();
		for (let i = 0; i < nodes.length; i++) {
			let node = nodes[i];
			let sphere = node.getBoundingSphere().clone().applyMatrix4(this.matrixWorld);

			if (_ray.intersectsSphere(sphere)) {
				nodesOnRay.push(node);
			}
		}

		return nodesOnRay;
	}

	updateMatrixWorld(force) {
		if (this.matrixAutoUpdate === true) this.updateMatrix();

		if (this.matrixWorldNeedsUpdate === true || force === true) {
			if (!this.parent) {
				this.matrixWorld.copy(this.matrix);
			} else {
				this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
			}

			this.matrixWorldNeedsUpdate = false;

			force = true;
		}
	}

	hideDescendants(object) {
		let stack = [];
		for (let i = 0; i < object.children.length; i++) {
			let child = object.children[i];
			if (child.visible) {
				stack.push(child);
			}
		}

		while (stack.length > 0) {
			let object = stack.shift();

			object.visible = false;

			for (let i = 0; i < object.children.length; i++) {
				let child = object.children[i];
				if (child.visible) {
					stack.push(child);
				}
			}
		}
	}

	moveToOrigin() {
		this.position.set(0, 0, 0);
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = computeTransformedBoundingBox(box, transform);
		this.position.set(0, 0, 0).sub(tBox.getCenter(new THREE.Vector3()));
	}

	moveToGroundPlane() {
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = computeTransformedBoundingBox(box, transform);
		this.position.y += -tBox.min.y;
	}

	getBoundingBoxWorld() {
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = computeTransformedBoundingBox(box, transform);

		return tBox;
	}

	/**
	 * Extract the points that fall inside `profile` (a `Profile` poly-line
	 * with a `width`). With a `callback` ({onProgress, onFinish, onCancel})
	 * the work streams asynchronously through a `ProfileRequest` driven by
	 * the per-frame octree update; without one it walks already-loaded nodes
	 * synchronously and returns the segmented result immediately.
	 *
	 * Requires the Profile tool subpath - importing anything from
	 * `potree-lib/tools` (which pulls in `tools/profile/ProfileRequest.js`)
	 * registers `ProfileRequest` here.
	 */
	getPointsInProfile(profile, maxDepth, callback) {
		if (callback) {
			if (!ProfileRequest) {
				throw new Error("PointCloudOctree.getPointsInProfile(): import from 'potree-lib/tools' first to enable ProfileRequest.");
			}
			let request = new ProfileRequest(this, profile, maxDepth, callback);
			this.profileRequests.push(request);

			return request;
		}

		let points = {
			segments: [],
			boundingBox: new THREE.Box3(),
			projectedBoundingBox: new THREE.Box2()
		};

		// evaluate segments
		for (let i = 0; i < profile.points.length - 1; i++) {
			let start = profile.points[i];
			let end = profile.points[i + 1];
			// NOTE: upstream's no-callback path is only partially wired
			// (`getProfile` streams asynchronously and returns nothing); kept
			// for API parity, but real use goes through the `callback` form.
			let ps = /** @type {any} */ (this.getProfile(start, end, profile.width, maxDepth));

			let segment = {
				start: start,
				end: end,
				points: ps,
				project: null
			};

			points.segments.push(segment);

			points.boundingBox.expandByPoint(ps.boundingBox.min);
			points.boundingBox.expandByPoint(ps.boundingBox.max);
		}

		// add projection functions to the segments
		let mileage = new THREE.Vector3();
		for (let i = 0; i < points.segments.length; i++) {
			let segment = points.segments[i];
			let start = segment.start;
			let end = segment.end;

			let project = (function (_start, _end, _mileage, _boundingBox) {
				let start = _start;
				let end = _end;
				let mileage = _mileage;
				let boundingBox = _boundingBox;

				let xAxis = new THREE.Vector3(1, 0, 0);
				let dir = new THREE.Vector3().subVectors(end, start);
				dir.y = 0;
				dir.normalize();
				let alpha = Math.acos(xAxis.dot(dir));
				if (dir.z > 0) {
					alpha = -alpha;
				}

				return function (position) {
					let toOrigin = new THREE.Matrix4().makeTranslation(-start.x, -boundingBox.min.y, -start.z);
					let alignWithX = new THREE.Matrix4().makeRotationY(-alpha);
					let applyMileage = new THREE.Matrix4().makeTranslation(mileage.x, 0, 0);

					let pos = position.clone();
					pos.applyMatrix4(toOrigin);
					pos.applyMatrix4(alignWithX);
					pos.applyMatrix4(applyMileage);

					return pos;
				};
			}(start, end, mileage.clone(), points.boundingBox.clone()));

			segment.project = project;

			mileage.x += new THREE.Vector3(start.x, 0, start.z).distanceTo(new THREE.Vector3(end.x, 0, end.z));
			mileage.y += end.y - start.y;
		}

		points.projectedBoundingBox.min.x = 0;
		points.projectedBoundingBox.min.y = points.boundingBox.min.y;
		points.projectedBoundingBox.max.x = mileage.x;
		points.projectedBoundingBox.max.y = points.boundingBox.max.y;

		return points;
	}

	/**
	 * Returns points inside the given profile bounds, searching up to the
	 * given octree `depth`. If `callback` is given, points are loaded before
	 * searching.
	 */
	getProfile(start, end, width, depth, callback) {
		if (!ProfileRequest) {
			throw new Error("PointCloudOctree.getProfile(): import from 'potree-lib/tools' first to enable ProfileRequest.");
		}
		let request = new ProfileRequest(start, end, width, depth, callback);
		this.profileRequests.push(request);
	}

	getVisibleExtent() {
		return this.visibleBounds.applyMatrix4(this.matrixWorld);
	}

	intersectsPoint(position) {
		let rootAvailable = this.pcoGeometry.root && this.pcoGeometry.root.geometry;

		if (!rootAvailable) {
			return false;
		}

		if (typeof this.signedDistanceField === "undefined") {
			const resolution = 32;
			const field = new Float32Array(resolution ** 3).fill(Infinity);

			const positions = this.pcoGeometry.root.geometry.attributes.position;
			const boundingBox = this.boundingBox;

			const n = positions.count;

			for (let i = 0; i < n; i = i + 3) {
				const x = positions.array[3 * i + 0];
				const y = positions.array[3 * i + 1];
				const z = positions.array[3 * i + 2];

				const ix = Math.trunc(Math.min(resolution * (x / boundingBox.max.x), resolution - 1));
				const iy = Math.trunc(Math.min(resolution * (y / boundingBox.max.y), resolution - 1));
				const iz = Math.trunc(Math.min(resolution * (z / boundingBox.max.z), resolution - 1));

				const index = ix + iy * resolution + iz * resolution * resolution;

				field[index] = 0;
			}

			this.signedDistanceField = {resolution, field};
		}

		{
			const sdf = this.signedDistanceField;
			const boundingBox = this.boundingBox;

			const toObjectSpace = this.matrixWorld.clone().invert();

			const objPos = position.clone().applyMatrix4(toObjectSpace);

			const resolution = sdf.resolution;
			const ix = Math.trunc(resolution * (objPos.x / boundingBox.max.x));
			const iy = Math.trunc(resolution * (objPos.y / boundingBox.max.y));
			const iz = Math.trunc(resolution * (objPos.z / boundingBox.max.z));

			if (ix < 0 || iy < 0 || iz < 0) {
				return false;
			}
			if (ix >= resolution || iy >= resolution || iz >= resolution) {
				return false;
			}

			const index = ix + iy * resolution + iz * resolution * resolution;

			const value = sdf.field[index];

			if (value === 0) {
				return true;
			}
		}

		return false;
	}

	/**
	 * params.pickWindowSize: look for points inside a pixel window of this
	 * size. Use odd values: 1, 3, 5, ...
	 */
	pick(viewer, camera, ray, params = {}) {
		let renderer = viewer.renderer;
		let pRenderer = viewer.pRenderer;

		let getVal = (a, b) => a !== undefined ? a : b;

		let pickWindowSize = getVal(params.pickWindowSize, 65);

		let size = renderer.getSize(new THREE.Vector2());

		let width = Math.ceil(getVal(params.width, size.width));
		let height = Math.ceil(getVal(params.height, size.height));

		let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		let pointSize = getVal(params.pointSize, this.material.size);

		let nodes = this.nodesOnRay(this.visibleNodes, ray);

		if (nodes.length === 0) {
			return null;
		}

		if (!this.pickState) {
			let scene = new THREE.Scene();

			let material = new PointCloudMaterial();
			material.activeAttributeName = "indices";

			let renderTarget = new THREE.WebGLRenderTarget(
				1, 1,
				{
					minFilter: THREE.LinearFilter,
					magFilter: THREE.NearestFilter,
					format: THREE.RGBAFormat,
				});

			this.pickState = {
				renderTarget: renderTarget,
				material: material,
				scene: scene,
			};
		}

		let pickState = this.pickState;
		let pickMaterial = pickState.material;

		{ // update pick material
			pickMaterial.pointSizeType = pointSizeType;
			pickMaterial.shape = PointShape.PARABOLOID;

			pickMaterial.uniforms.uFilterReturnNumberRange.value = this.material.uniforms.uFilterReturnNumberRange.value;
			pickMaterial.uniforms.uFilterNumberOfReturnsRange.value = this.material.uniforms.uFilterNumberOfReturnsRange.value;
			pickMaterial.uniforms.uFilterGPSTimeClipRange.value = this.material.uniforms.uFilterGPSTimeClipRange.value;
			pickMaterial.uniforms.uFilterPointSourceIDClipRange.value = this.material.uniforms.uFilterPointSourceIDClipRange.value;

			pickMaterial.activeAttributeName = "indices";

			pickMaterial.size = pointSize;
			pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
			pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
			pickMaterial.classification = this.material.classification;
			pickMaterial.recomputeClassification();

			if (params.pickClipped) {
				pickMaterial.clipBoxes = this.material.clipBoxes;
				pickMaterial.uniforms.clipBoxes = this.material.uniforms.clipBoxes;
				if (this.material.clipTask === ClipTask.HIGHLIGHT) {
					pickMaterial.clipTask = ClipTask.NONE;
				} else {
					pickMaterial.clipTask = this.material.clipTask;
				}
				pickMaterial.clipMethod = this.material.clipMethod;
			} else {
				pickMaterial.clipBoxes = [];
			}

			this.updateMaterial(pickMaterial, nodes, camera, renderer);
		}

		pickState.renderTarget.setSize(width, height);

		let pixelPos = new THREE.Vector2(params.x, params.y);

		let gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(
			Math.trunc(pixelPos.x - (pickWindowSize - 1) / 2),
			Math.trunc(pixelPos.y - (pickWindowSize - 1) / 2),
			Math.trunc(pickWindowSize), Math.trunc(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(THREE.NoBlending);

		{ // RENDER
			renderer.setRenderTarget(pickState.renderTarget);
			gl.clearColor(0, 0, 0, 0);
			renderer.clear(true, true, true);

			let tmp = this.material;
			this.material = pickMaterial;

			pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

			this.material = tmp;
		}

		let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

		let x = Math.trunc(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		let y = Math.trunc(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));

		let buffer = new Uint8Array(4 * pickWindowSize * pickWindowSize);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.state.reset();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		let pixels = buffer;
		let ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		let hits = [];
		for (let u = 0; u < pickWindowSize; u++) {
			for (let v = 0; v < pickWindowSize; v++) {
				let offset = (u + v * pickWindowSize);
				let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				let pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				let pIndex = ibuffer[offset];

				if (!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined)) {
					let hit = {
						pIndex: pIndex,
						pcIndex: pcIndex,
						distanceToCenter: distance,
					};

					if (params.all) {
						hits.push(hit);
					} else {
						if (hits.length > 0) {
							if (distance < hits[0].distanceToCenter) {
								hits[0] = hit;
							}
						} else {
							hits.push(hit);
						}
					}
				}
			}
		}

		for (let hit of hits) {
			let point = {};

			if (!nodes[hit.pcIndex]) {
				return null;
			}

			let node = nodes[hit.pcIndex];
			let pc = node.sceneNode;
			let geometry = node.geometryNode.geometry;

			for (let attributeName in geometry.attributes) {
				let attribute = geometry.attributes[attributeName];

				if (attributeName === 'position') {
					let x = attribute.array[3 * hit.pIndex + 0];
					let y = attribute.array[3 * hit.pIndex + 1];
					let z = attribute.array[3 * hit.pIndex + 2];

					let position = new THREE.Vector3(x, y, z);
					position.applyMatrix4(pc.matrixWorld);

					point[attributeName] = position;
				} else if (attributeName === 'indices') {
					// no-op: index buffer, not a point attribute
				} else {
					let values = attribute.array.slice(attribute.itemSize * hit.pIndex, attribute.itemSize * (hit.pIndex + 1));

					if (attribute.potree) {
						const {scale, offset} = attribute.potree;
						values = values.map(v => v / scale + offset);
					}

					point[attributeName] = values;
				}
			}

			hit.point = point;
		}

		if (params.all) {
			return hits.map(hit => hit.point);
		} else {
			if (hits.length === 0) {
				return null;
			} else {
				return hits[0].point;
			}
		}
	}

	* getFittedBoxGen(boxNode) {
		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = boxNode.matrixWorld.clone().invert();

		for (let node of this.visibleNodes) {
			if (!node.sceneNode) {
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for (let i = 0; i < buffer.numElements; i++) {
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5) {
					if (-0.5 < pos.y && pos.y < 0.5) {
						if (-0.5 < pos.z && pos.z < 0.5) {
							shrinkedLocalBounds.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z));
						}
					}
				}
			}

			yield;
		}

		let fittedPosition = shrinkedLocalBounds.getCenter(new THREE.Vector3()).applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		yield fitted;
	}

	getFittedBox(boxNode, maxLevel = Infinity) {
		maxLevel = Infinity;

		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = boxNode.matrixWorld.clone().invert();

		for (let node of this.visibleNodes) {
			if (!node.sceneNode || node.getLevel() > maxLevel) {
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for (let i = 0; i < buffer.numElements; i++) {
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5) {
					if (-0.5 < pos.y && pos.y < 0.5) {
						if (-0.5 < pos.z && pos.z < 0.5) {
							shrinkedLocalBounds.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z));
						}
					}
				}
			}
		}

		let fittedPosition = shrinkedLocalBounds.getCenter(new THREE.Vector3()).applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		return fitted;
	}

	get progress() {
		return this.visibleNodes.length / this.visibleGeometry.length;
	}

	find(name) {
		let node = /** @type {any} */ (null);
		for (let char of name) {
			if (char === "r") {
				node = this.root;
			} else {
				node = node.children[char];
			}
		}

		return node;
	}

	// @ts-expect-error TS2611: three.js declares Object3D.visible as a plain
	// property; there's no clean way to override it as an accessor under
	// checkJs short of casting every call site, so this one's accepted.
	get visible() {
		return this._visible;
	}

	set visible(value) {
		if (value !== this._visible) {
			this._visible = value;

			this.dispatchEvent({type: 'visibility_changed', pointcloud: this});
		}
	}

}
