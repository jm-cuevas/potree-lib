import * as THREE from "three";

/**
 * @param {THREE.Box3} box
 * @param {THREE.Matrix4} transform
 * @returns {THREE.Box3}
 */
export function computeTransformedBoundingBox(box, transform){
	let vertices = [
		new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
		new THREE.Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
		new THREE.Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
		new THREE.Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
		new THREE.Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
		new THREE.Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
		new THREE.Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
		new THREE.Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
	];

	let boundingBox = new THREE.Box3();
	boundingBox.setFromPoints(vertices);

	return boundingBox;
}

/**
 * @param {{x: number, y: number}} mouse - mouse position in element/canvas pixels
 * @param {THREE.Camera} camera
 * @param {number} width - element/canvas width in pixels
 * @param {number} height - element/canvas height in pixels
 * @returns {THREE.Ray}
 */
export function mouseToRay(mouse, camera, width, height){
	let normalizedMouse = {
		x: (mouse.x / width) * 2 - 1,
		y: -(mouse.y / height) * 2 + 1
	};

	let vector = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0.5);
	let origin = camera.position.clone();
	vector.unproject(camera);
	let direction = new THREE.Vector3().subVectors(vector, origin).normalize();

	return new THREE.Ray(origin, direction);
}

/**
 * Screen-space radius of a sphere of the given world-space `radius`, seen from `distance`.
 */
export function projectedRadiusPerspective(radius, fov, distance, screenHeight){
	let projFactor = (1 / Math.tan(fov / 2)) / distance;
	projFactor = projFactor * screenHeight / 2;

	return radius * projFactor;
}

export function projectedRadiusOrtho(radius, proj, screenWidth, screenHeight){
	let p1 = new THREE.Vector4(0);
	let p2 = new THREE.Vector4(radius);

	p1.applyMatrix4(proj);
	p2.applyMatrix4(proj);
	let p1v3 = new THREE.Vector3(p1.x, p1.y, p1.z);
	let p2v3 = new THREE.Vector3(p2.x, p2.y, p2.z);
	p1v3.x = (p1v3.x + 1.0) * 0.5 * screenWidth;
	p1v3.y = (p1v3.y + 1.0) * 0.5 * screenHeight;
	p2v3.x = (p2v3.x + 1.0) * 0.5 * screenWidth;
	p2v3.y = (p2v3.y + 1.0) * 0.5 * screenHeight;

	return p1v3.distanceTo(p2v3);
}

/**
 * @param {number} radius - world-space radius
 * @param {THREE.PerspectiveCamera | THREE.OrthographicCamera} camera
 * @param {number} distance - only used for perspective cameras
 * @param {number} screenWidth
 * @param {number} screenHeight
 */
export function projectedRadius(radius, camera, distance, screenWidth, screenHeight){
	if(camera instanceof THREE.OrthographicCamera){
		return projectedRadiusOrtho(radius, camera.projectionMatrix, screenWidth, screenHeight);
	}else if(camera instanceof THREE.PerspectiveCamera){
		return projectedRadiusPerspective(radius, camera.fov * Math.PI / 180, distance, screenHeight);
	}else{
		throw new Error("invalid parameters");
	}
}

/**
 * Picks the closest point cloud intersection under the mouse cursor.
 * Relies on each pointcloud exposing a `pick(viewer, camera, ray, params)` method
 * (added by the octree loader/point cloud classes).
 *
 * @param {{x: number, y: number}} mouse
 * @param {THREE.Camera} camera
 * @param {import("../core/Viewer.js").Viewer} viewer
 * @param {Array} pointclouds
 * @param {object} [params={}]
 */
export function getMousePointCloudIntersection(mouse, camera, viewer, pointclouds, params = {}){
	let renderer = viewer.renderer;

	let nmouse = new THREE.Vector2(
		(mouse.x / renderer.domElement.clientWidth) * 2 - 1,
		-(mouse.y / renderer.domElement.clientHeight) * 2 + 1
	);

	let pickParams = {};

	if(params.pickClipped){
		pickParams.pickClipped = params.pickClipped;
	}

	pickParams.x = mouse.x;
	pickParams.y = renderer.domElement.clientHeight - mouse.y;

	let raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(nmouse, camera);
	let ray = raycaster.ray;

	let selectedPointcloud = null;
	let closestDistance = Infinity;
	let closestIntersection = null;
	let closestPoint = null;

	for(let pointcloud of pointclouds){
		let point = pointcloud.pick(viewer, camera, ray, pickParams);

		if(!point){
			continue;
		}

		let distance = camera.position.distanceTo(point.position);

		if(distance < closestDistance){
			closestDistance = distance;
			selectedPointcloud = pointcloud;
			closestIntersection = point.position;
			closestPoint = point;
		}
	}

	if(selectedPointcloud){
		return {
			location: closestIntersection,
			distance: closestDistance,
			pointcloud: selectedPointcloud,
			point: closestPoint
		};
	}

	return null;
}
