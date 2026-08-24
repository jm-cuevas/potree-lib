import * as THREE from "three";
import {ClipTask, ClipMethod} from "../core/defines.js";
import {Box3Helper} from "../tools/helpers/Box3Helper.js";
import {BinaryHeap} from "./BinaryHeap.js";
import {lru, loaderState} from "./LoaderState.js";

// per-pointcloud transform-change tracking, module-scoped so it survives
// across calls the way the original `Potree._pointcloudTransformVersion`
// lazily-initialized global did.
const pointcloudTransformVersion = new Map();

/**
 * Runs one frame of octree LOD refinement: walks each visible pointcloud's
 * octree/EPT/COPC tree from the root, in closest/largest-first order,
 * revealing nodes up to the point budget and kicking off loads for the
 * cheapest still-unloaded ones. Call once per frame from the render loop.
 *
 * @param {Array} pointclouds
 * @param {THREE.Camera} camera
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} [options]
 * @param {number} [options.pointBudget] total visible point budget across all pointclouds.
 * @param {number} [options.pointLoadLimit] total *loaded* (not just visible) point cap before older nodes are evicted; defaults to `2 * pointBudget`.
 * @returns {{visibleNodes: Array, numVisiblePoints: number, lowestSpacing: number}}
 */
export function updatePointClouds(pointclouds, camera, renderer, options = {}) {
	const pointBudget = options.pointBudget ?? 1_000_000;
	const pointLoadLimit = options.pointLoadLimit ?? (pointBudget * 2);

	for (let pointcloud of pointclouds) {
		let start = performance.now();

		for (let profileRequest of pointcloud.profileRequests) {
			profileRequest.update();

			let duration = performance.now() - start;
			if (duration > 5) {
				break;
			}
		}
	}

	let result = updateVisibility(pointclouds, camera, renderer, {pointBudget});

	for (let pointcloud of pointclouds) {
		pointcloud.updateMaterial(pointcloud.material, pointcloud.visibleNodes, camera, renderer);
		pointcloud.updateVisibleBounds();
	}

	lru.freeMemory(pointLoadLimit);

	return result;
}

export function updateVisibilityStructures(pointclouds, camera, renderer) {
	let frustums = [];
	let camObjPositions = [];
	let priorityQueue = new BinaryHeap(x => 1 / x.weight);

	for (let i = 0; i < pointclouds.length; i++) {
		let pointcloud = pointclouds[i];

		if (!pointcloud.initialized()) {
			continue;
		}

		pointcloud.numVisibleNodes = 0;
		pointcloud.numVisiblePoints = 0;
		pointcloud.deepestVisibleLevel = 0;
		pointcloud.visibleNodes = [];
		pointcloud.visibleGeometry = [];

		// frustum in object space
		camera.updateMatrixWorld();
		let frustum = new THREE.Frustum();
		let viewI = camera.matrixWorldInverse;
		let world = pointcloud.matrixWorld;

		let proj = camera.projectionMatrix;

		let fm = new THREE.Matrix4().multiply(proj).multiply(viewI).multiply(world);
		frustum.setFromProjectionMatrix(fm);
		frustums.push(frustum);

		// camera position in object space
		let view = camera.matrixWorld;
		let worldI = world.clone().invert();
		let camMatrixObject = new THREE.Matrix4().multiply(worldI).multiply(view);
		let camObjPos = new THREE.Vector3().setFromMatrixPosition(camMatrixObject);
		camObjPositions.push(camObjPos);

		if (pointcloud.visible && pointcloud.root !== null) {
			priorityQueue.push({pointcloud: i, node: pointcloud.root, weight: Number.MAX_VALUE});
		}

		// hide all previously visible nodes
		if (pointcloud.root.isTreeNode()) {
			pointcloud.hideDescendants(pointcloud.root.sceneNode);
		}

		for (let j = 0; j < pointcloud.boundingBoxNodes.length; j++) {
			pointcloud.boundingBoxNodes[j].visible = false;
		}
	}

	return {frustums, camObjPositions, priorityQueue};
}

export function updateVisibility(pointclouds, camera, renderer, options = {}) {
	const pointBudget = options.pointBudget ?? 1_000_000;

	let numVisiblePoints = 0;

	let numVisiblePointsInPointclouds = new Map(pointclouds.map(pc => [pc, 0]));

	let visibleNodes = [];
	let visibleGeometry = [];
	let unloadedGeometry = [];

	let lowestSpacing = Infinity;

	// calculate object space frustum and cam pos and setup priority queue
	let s = updateVisibilityStructures(pointclouds, camera, renderer);
	let frustums = s.frustums;
	let camObjPositions = s.camObjPositions;
	let priorityQueue = s.priorityQueue;

	let loadedToGPUThisFrame = 0;

	let domWidth = renderer.domElement.clientWidth;
	let domHeight = renderer.domElement.clientHeight;

	// check if pointcloud has been transformed; some code below only runs
	// when changes have been detected
	for (let pointcloud of pointclouds) {
		if (!pointcloud.visible) {
			continue;
		}

		pointcloud.updateMatrixWorld();

		if (!pointcloudTransformVersion.has(pointcloud)) {
			pointcloudTransformVersion.set(pointcloud, {number: 0, transform: pointcloud.matrixWorld.clone()});
		} else {
			let version = pointcloudTransformVersion.get(pointcloud);

			if (!version.transform.equals(pointcloud.matrixWorld)) {
				version.number++;
				version.transform.copy(pointcloud.matrixWorld);

				pointcloud.dispatchEvent({
					type: "transformation_changed",
					target: pointcloud,
				});
			}
		}
	}

	while (priorityQueue.size() > 0) {
		let element = priorityQueue.pop();
		let node = element.node;
		let parent = element.parent;
		let pointcloud = pointclouds[element.pointcloud];

		let box = node.getBoundingBox();
		let frustum = frustums[element.pointcloud];
		let camObjPos = camObjPositions[element.pointcloud];

		let insideFrustum = frustum.intersectsBox(box);
		let maxLevel = pointcloud.maxLevel || Infinity;
		let level = node.getLevel();
		let visible = insideFrustum;
		visible = visible && !(numVisiblePoints + node.getNumPoints() > pointBudget);
		visible = visible && !(numVisiblePointsInPointclouds.get(pointcloud) + node.getNumPoints() > pointcloud.pointBudget);
		visible = visible && level < maxLevel;
		visible = visible || node.getLevel() <= 2;

		let clipBoxes = pointcloud.material.clipBoxes;
		if (clipBoxes.length > 0) {
			let numIntersecting = 0;
			let numIntersectionVolumes = 0;

			for (let clipBox of clipBoxes) {
				let pcWorldInverse = pointcloud.matrixWorld.clone().invert();
				let toPCObject = pcWorldInverse.multiply(clipBox.box.matrixWorld);

				let px = new THREE.Vector3(+0.5, 0, 0).applyMatrix4(pcWorldInverse);
				let nx = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(pcWorldInverse);
				let py = new THREE.Vector3(0, +0.5, 0).applyMatrix4(pcWorldInverse);
				let ny = new THREE.Vector3(0, -0.5, 0).applyMatrix4(pcWorldInverse);
				let pz = new THREE.Vector3(0, 0, +0.5).applyMatrix4(pcWorldInverse);
				let nz = new THREE.Vector3(0, 0, -0.5).applyMatrix4(pcWorldInverse);

				let pxN = new THREE.Vector3().subVectors(nx, px).normalize();
				let nxN = pxN.clone().multiplyScalar(-1);
				let pyN = new THREE.Vector3().subVectors(ny, py).normalize();
				let nyN = pyN.clone().multiplyScalar(-1);
				let pzN = new THREE.Vector3().subVectors(nz, pz).normalize();
				let nzN = pzN.clone().multiplyScalar(-1);

				let pxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pxN, px);
				let nxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nxN, nx);
				let pyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pyN, py);
				let nyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nyN, ny);
				let pzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pzN, pz);
				let nzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nzN, nz);

				let clipFrustum = new THREE.Frustum(pxPlane, nxPlane, pyPlane, nyPlane, pzPlane, nzPlane);
				let intersects = clipFrustum.intersectsBox(box);

				if (intersects) {
					numIntersecting++;
				}
				numIntersectionVolumes++;
			}

			let insideAny = numIntersecting > 0;
			let insideAll = numIntersecting === numIntersectionVolumes;

			if (pointcloud.material.clipTask === ClipTask.SHOW_INSIDE) {
				if (pointcloud.material.clipMethod === ClipMethod.INSIDE_ANY && insideAny) {
					// keep visible
				} else if (pointcloud.material.clipMethod === ClipMethod.INSIDE_ALL && insideAll) {
					// keep visible
				} else {
					visible = false;
				}
			} else if (pointcloud.material.clipTask === ClipTask.SHOW_OUTSIDE) {
				// SHOW_OUTSIDE is intentionally a no-op here, matching upstream:
				// clip-outside filtering happens in the shader, not the LOD pass.
			}
		}

		if (node.spacing) {
			lowestSpacing = Math.min(lowestSpacing, node.spacing);
		} else if (node.geometryNode && node.geometryNode.spacing) {
			lowestSpacing = Math.min(lowestSpacing, node.geometryNode.spacing);
		}

		if (numVisiblePoints + node.getNumPoints() > pointBudget) {
			break;
		}

		if (!visible) {
			continue;
		}

		numVisiblePoints += node.getNumPoints();
		let numVisiblePointsInPointcloud = numVisiblePointsInPointclouds.get(pointcloud);
		numVisiblePointsInPointclouds.set(pointcloud, numVisiblePointsInPointcloud + node.getNumPoints());

		pointcloud.numVisibleNodes++;
		pointcloud.numVisiblePoints += node.getNumPoints();

		if (node.isGeometryNode() && (!parent || parent.isTreeNode())) {
			if (node.isLoaded() && loadedToGPUThisFrame < 2) {
				node = pointcloud.toTreeNode(node, parent);
				loadedToGPUThisFrame++;
			} else {
				unloadedGeometry.push(node);
				visibleGeometry.push(node);
			}
		}

		if (node.isTreeNode()) {
			lru.touch(node.geometryNode);
			node.sceneNode.visible = true;
			node.sceneNode.material = pointcloud.material;

			visibleNodes.push(node);
			pointcloud.visibleNodes.push(node);

			if (node._transformVersion === undefined) {
				node._transformVersion = -1;
			}
			let transformVersion = pointcloudTransformVersion.get(pointcloud);
			if (node._transformVersion !== transformVersion.number) {
				node.sceneNode.updateMatrix();
				node.sceneNode.matrixWorld.multiplyMatrices(pointcloud.matrixWorld, node.sceneNode.matrix);
				node._transformVersion = transformVersion.number;
			}

			if (pointcloud.showBoundingBox && !node.boundingBoxNode && node.getBoundingBox) {
				let boxHelper = new Box3Helper(node.getBoundingBox());
				boxHelper.matrixAutoUpdate = false;
				pointcloud.boundingBoxNodes.push(boxHelper);
				node.boundingBoxNode = boxHelper;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			} else if (pointcloud.showBoundingBox) {
				node.boundingBoxNode.visible = true;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			} else if (!pointcloud.showBoundingBox && node.boundingBoxNode) {
				node.boundingBoxNode.visible = false;
			}
		}

		// add child nodes to priorityQueue
		let children = node.getChildren();
		for (let i = 0; i < children.length; i++) {
			let child = children[i];

			let weight = 0;
			if (camera.isPerspectiveCamera) {
				let sphere = child.getBoundingSphere();
				let center = sphere.center;

				let dx = camObjPos.x - center.x;
				let dy = camObjPos.y - center.y;
				let dz = camObjPos.z - center.z;

				let dd = dx * dx + dy * dy + dz * dz;
				let distance = Math.sqrt(dd);

				let radius = sphere.radius;

				let fov = (camera.fov * Math.PI) / 180;
				let slope = Math.tan(fov / 2);
				let projFactor = (0.5 * domHeight) / (slope * distance);
				let screenPixelRadius = radius * projFactor;

				if (screenPixelRadius < pointcloud.minimumNodePixelSize) {
					continue;
				}

				weight = screenPixelRadius;

				if (distance - radius < 0) {
					weight = Number.MAX_VALUE;
				}
			} else {
				// TODO ortho visibility
				let bb = child.getBoundingBox();
				let diagonal = bb.max.clone().sub(bb.min).length();

				weight = diagonal;
			}

			priorityQueue.push({pointcloud: element.pointcloud, node: child, parent: node, weight: weight});
		}
	} // end priority queue loop

	for (let i = 0; i < Math.min(loaderState.maxNodesLoading, unloadedGeometry.length); i++) {
		unloadedGeometry[i].load();
	}

	return {
		visibleNodes: visibleNodes,
		numVisiblePoints: numVisiblePoints,
		lowestSpacing: lowestSpacing,
	};
}
