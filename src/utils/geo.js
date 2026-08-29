import * as THREE from "three";
import proj4 from "proj4";

/**
 * Vector pointing to (true) north from `p1`, `distance` units long.
 *
 * With a projection string, coordinates are transformed to WGS84, the north
 * direction is computed there, and the result is transformed back; without one,
 * `[0, 1, 0]` is assumed to be north.
 *
 * @param {THREE.Vector3} p1
 * @param {number} distance
 * @param {string} [projection] - a proj4 definition string for the point cloud CRS
 * @returns {THREE.Vector3}
 */
export function getNorthVec(p1, distance, projection){
	if(projection){
		proj4.defs("pointcloud", projection);
		const transform = proj4("pointcloud", "WGS84");

		const llP1 = transform.forward(p1.toArray());
		let llP2 = transform.forward([p1.x, p1.y + distance]);
		const polarRadius = Math.sqrt((llP2[0] - llP1[0]) ** 2 + (llP2[1] - llP1[1]) ** 2);
		llP2 = [llP1[0], llP1[1] + polarRadius];

		const northVec = transform.inverse(llP2);

		return new THREE.Vector3(northVec[0], northVec[1], p1.z).sub(p1);
	}else{
		return new THREE.Vector3(0, 1, 0).multiplyScalar(distance);
	}
}

/**
 * Clockwise azimuth (radians) of the direction from `p1` to `p2`.
 *
 * With a projection the angle is measured relative to true north (after a WGS84
 * transform); without one, relative to `[0, 1, 0]`.
 *
 * @param {THREE.Vector3} p1
 * @param {THREE.Vector3} p2
 * @param {string} [projection] - a proj4 definition string, or an `EPSG:xxxx` code
 * @returns {number}
 */
export function computeAzimuth(p1, p2, projection){
	let azimuth = 0;

	if(projection){
		let transform;

		if(projection.includes("EPSG")){
			transform = proj4(projection, "WGS84");
		}else{
			proj4.defs("pointcloud", projection);
			transform = proj4("pointcloud", "WGS84");
		}

		const llP1 = transform.forward(p1.toArray());
		const llP2 = transform.forward(p2.toArray());
		const dir = [
			llP2[0] - llP1[0],
			llP2[1] - llP1[1],
		];
		azimuth = Math.atan2(dir[1], dir[0]) - Math.PI / 2;
	}else{
		const dir = [p2.x - p1.x, p2.y - p1.y];
		azimuth = Math.atan2(dir[1], dir[0]) - Math.PI / 2;
	}

	// make clockwise
	return -azimuth;
}
