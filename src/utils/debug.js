import * as THREE from "three";

/**
 * Adds a debug line to `parent` and returns a handle to update its endpoints.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @param {number} [color=0xFF0000]
 * @returns {{node: THREE.Line, set: (start: THREE.Vector3, end: THREE.Vector3) => void}}
 */
export function debugLine(parent, start, end, color = 0xFF0000){
	let material = new THREE.LineBasicMaterial({color: color});
	let geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
	let node = new THREE.Line(geometry, material);
	parent.add(node);

	function set(newStart, newEnd){
		node.geometry.dispose();
		node.geometry = new THREE.BufferGeometry().setFromPoints([newStart, newEnd]);
	}

	return {node, set};
}

/**
 * Adds a small sphere at `position`. With no `color`, a `MeshNormalMaterial` is used.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.Vector3} position
 * @param {number} scale - uniform radius
 * @param {number} [color]
 * @returns {THREE.Mesh}
 */
export function debugSphere(parent, position, scale, color){
	let geometry = new THREE.SphereGeometry(1, 8, 8);
	let material = (color !== undefined)
		? new THREE.MeshBasicMaterial({color: color})
		: new THREE.MeshNormalMaterial();

	let sphere = new THREE.Mesh(geometry, material);
	sphere.position.copy(position);
	sphere.scale.set(scale, scale, scale);
	parent.add(sphere);

	return sphere;
}

/**
 * Adds a unit circle (in the local XY plane) at `center`, scaled by `radius`.
 * `normal` is accepted for API compatibility but currently unused.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.Vector3} center
 * @param {number} radius
 * @param {THREE.Vector3} [normal]
 * @param {number} [color]
 * @returns {THREE.Line}
 */
export function debugCircle(parent, center, radius, normal, color){
	let material = new THREE.LineBasicMaterial({color: color});

	let n = 32;
	let points = [];
	for(let i = 0; i < n; i++){
		let u = 2 * Math.PI * (i / n);
		points.push(new THREE.Vector3(Math.cos(u), Math.sin(u), 0));
	}

	let geometry = new THREE.BufferGeometry().setFromPoints(points);
	let circle = new THREE.LineLoop(geometry, material);
	circle.position.copy(center);
	circle.scale.set(radius, radius, radius);

	parent.add(circle);

	return circle;
}

/**
 * Draws the wireframe edges of `box` (optionally transformed), plus a sphere at
 * each corner and one colour-coded sphere per face centre.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.Box3} box
 * @param {THREE.Matrix4} [transform]
 * @param {number} [color=0xFFFF00]
 */
export function debugBox(parent, box, transform = new THREE.Matrix4(), color = 0xFFFF00){
	let vertices = [
		[box.min.x, box.min.y, box.min.z],
		[box.min.x, box.min.y, box.max.z],
		[box.min.x, box.max.y, box.min.z],
		[box.min.x, box.max.y, box.max.z],
		[box.max.x, box.min.y, box.min.z],
		[box.max.x, box.min.y, box.max.z],
		[box.max.x, box.max.y, box.min.z],
		[box.max.x, box.max.y, box.max.z],
	].map(v => new THREE.Vector3(v[0], v[1], v[2]));

	let edges = [
		[0, 4], [4, 5], [5, 1], [1, 0],
		[2, 6], [6, 7], [7, 3], [3, 2],
		[0, 2], [4, 6], [5, 7], [1, 3],
	];

	let center = box.getCenter(new THREE.Vector3());

	let centroids = [
		{position: [box.min.x, center.y, center.z], color: 0xFF0000},
		{position: [box.max.x, center.y, center.z], color: 0x880000},
		{position: [center.x, box.min.y, center.z], color: 0x00FF00},
		{position: [center.x, box.max.y, center.z], color: 0x008800},
		{position: [center.x, center.y, box.min.z], color: 0x0000FF},
		{position: [center.x, center.y, box.max.z], color: 0x000088},
	];

	for(let vertex of vertices){
		let pos = vertex.clone().applyMatrix4(transform);
		debugSphere(parent, pos, 0.1, 0xFF0000);
	}

	for(let edge of edges){
		let start = vertices[edge[0]].clone().applyMatrix4(transform);
		let end = vertices[edge[1]].clone().applyMatrix4(transform);
		debugLine(parent, start, end, color);
	}

	for(let centroid of centroids){
		let pos = new THREE.Vector3(centroid.position[0], centroid.position[1], centroid.position[2]).applyMatrix4(transform);
		debugSphere(parent, pos, 0.1, centroid.color);
	}
}

/**
 * Adds a `THREE.PlaneHelper` for `plane` to `parent`.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.Plane} plane
 * @param {number} [size=1]
 * @param {number} [color=0x0000FF]
 */
export function debugPlane(parent, plane, size = 1, color = 0x0000FF){
	let planehelper = new THREE.PlaneHelper(plane, size, color);
	parent.add(planehelper);
}

/**
 * A `width` x `length` grid of lines in the XY plane, cells `spacing` units wide.
 *
 * @param {number} width - number of cells along x
 * @param {number} length - number of cells along y
 * @param {number} spacing
 * @param {number} [color=0x888888]
 * @returns {THREE.LineSegments}
 */
export function createGrid(width, length, spacing, color){
	let material = new THREE.LineBasicMaterial({color: color || 0x888888});

	let points = [];
	for(let i = 0; i <= length; i++){
		points.push(new THREE.Vector3(-(spacing * width) / 2, i * spacing - (spacing * length) / 2, 0));
		points.push(new THREE.Vector3(+(spacing * width) / 2, i * spacing - (spacing * length) / 2, 0));
	}

	for(let i = 0; i <= width; i++){
		points.push(new THREE.Vector3(i * spacing - (spacing * width) / 2, -(spacing * length) / 2, 0));
		points.push(new THREE.Vector3(i * spacing - (spacing * width) / 2, +(spacing * length) / 2, 0));
	}

	let geometry = new THREE.BufferGeometry().setFromPoints(points);
	let line = new THREE.LineSegments(geometry, material);
	line.receiveShadow = true;

	return line;
}
