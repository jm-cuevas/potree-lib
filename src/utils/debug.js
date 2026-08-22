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
