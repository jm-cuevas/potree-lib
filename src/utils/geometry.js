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
 * Octree child bounding box, given the parent box and a child index in the
 * usual Potree bit-packed order (bit 0: z-half, bit 1: y-half, bit 2: x-half).
 *
 * @param {THREE.Box3} aabb
 * @param {number} index
 * @returns {THREE.Box3}
 */
export function createChildAABB(aabb, index){
	let min = aabb.min.clone();
	let max = aabb.max.clone();
	let size = new THREE.Vector3().subVectors(max, min);

	if ((index & 0b0001) > 0) {
		min.z += size.z / 2;
	} else {
		max.z -= size.z / 2;
	}

	if ((index & 0b0010) > 0) {
		min.y += size.y / 2;
	} else {
		max.y -= size.y / 2;
	}

	if ((index & 0b0100) > 0) {
		min.x += size.x / 2;
	} else {
		max.x -= size.x / 2;
	}

	return new THREE.Box3(min, max);
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
 * Classifies a sphere against a frustum.
 *
 * @param {THREE.Frustum} frustum
 * @param {THREE.Sphere} sphere
 * @returns {0 | 1 | 2} 0: no intersection, 1: intersection, 2: fully inside
 */
export function frustumSphereIntersection(frustum, sphere){
	let planes = frustum.planes;
	let center = sphere.center;
	let negRadius = -sphere.radius;

	let minDistance = Number.MAX_VALUE;

	for(let i = 0; i < 6; i++){
		let distance = planes[i].distanceToPoint(center);

		if(distance < negRadius){
			return 0;
		}

		minDistance = Math.min(minDistance, distance);
	}

	return (minDistance >= sphere.radius) ? 2 : 1;
}

/**
 * Midpoint of the shortest segment between line (P0,P1) and line (P2,P3) in 3D.
 * Adapted from Paul Bourke's line-line intersection.
 *
 * @param {THREE.Vector3} P0
 * @param {THREE.Vector3} P1
 * @param {THREE.Vector3} P2
 * @param {THREE.Vector3} P3
 * @returns {THREE.Vector3}
 */
export function lineToLineIntersection(P0, P1, P2, P3){
	const P = [P0, P1, P2, P3];

	const d = (m, n, o, p) => {
		return (P[m].x - P[n].x) * (P[o].x - P[p].x)
			+ (P[m].y - P[n].y) * (P[o].y - P[p].y)
			+ (P[m].z - P[n].z) * (P[o].z - P[p].z);
	};

	const mua = (d(0, 2, 3, 2) * d(3, 2, 1, 0) - d(0, 2, 1, 0) * d(3, 2, 3, 2))
		/ (d(1, 0, 1, 0) * d(3, 2, 3, 2) - d(3, 2, 1, 0) * d(3, 2, 1, 0));

	const mub = (d(0, 2, 3, 2) + mua * d(3, 2, 1, 0)) / d(3, 2, 3, 2);

	const P01 = P1.clone().sub(P0);
	const P23 = P3.clone().sub(P2);

	const Pa = P0.clone().add(P01.multiplyScalar(mua));
	const Pb = P2.clone().add(P23.multiplyScalar(mub));

	return Pa.clone().add(Pb).multiplyScalar(0.5);
}

/**
 * Center of the circle passing through the three points A, B, C.
 *
 * @param {THREE.Vector3} A
 * @param {THREE.Vector3} B
 * @param {THREE.Vector3} C
 * @returns {THREE.Vector3}
 */
export function computeCircleCenter(A, B, C){
	const AB = B.clone().sub(A);
	const AC = C.clone().sub(A);

	const N = AC.clone().cross(AB).normalize();

	const ab_dir = AB.clone().cross(N).normalize();
	const ac_dir = AC.clone().cross(N).normalize();

	const ab_origin = A.clone().add(B).multiplyScalar(0.5);
	const ac_origin = A.clone().add(C).multiplyScalar(0.5);

	const P0 = ab_origin;
	const P1 = ab_origin.clone().add(ab_dir);

	const P2 = ac_origin;
	const P3 = ac_origin.clone().add(ac_dir);

	return lineToLineIntersection(P0, P1, P2, P3);
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
