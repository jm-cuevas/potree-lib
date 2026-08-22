import * as THREE from "three";

/**
 * Same as THREE.Ray.distanceToPlane(), but returns negative distances for
 * planes the ray points away from instead of null.
 * Ported from the `THREE.Ray.prototype.distanceToPlaneWithNegative` monkeypatch.
 *
 * @param {THREE.Ray} ray
 * @param {THREE.Plane} plane
 * @returns {number | null}
 */
export function distanceToPlaneWithNegative(ray, plane){
	let denominator = plane.normal.dot(ray.direction);
	if(denominator === 0){
		if(plane.distanceToPoint(ray.origin) === 0){
			return 0;
		}

		return null;
	}

	let t = -(ray.origin.dot(plane.normal) + plane.constant) / denominator;

	return t;
}

/**
 * Moves a perspective camera so that `node`'s bounding sphere fills the
 * view frustum, scaled by `factor`.
 * Ported from the `THREE.PerspectiveCamera.prototype.zoomTo` monkeypatch.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {*} node - object with a `boundingSphere`, `geometry.boundingSphere`, or `boundingBox`
 * @param {number} [factor=1]
 */
export function zoomToPerspective(camera, node, factor = 1){
	if(!node.geometry && !node.boundingSphere && !node.boundingBox){
		return;
	}

	if(node.geometry && node.geometry.boundingSphere === null){
		node.geometry.computeBoundingSphere();
	}

	node.updateMatrixWorld();

	let bs;
	if(node.boundingSphere){
		bs = node.boundingSphere;
	}else if(node.geometry && node.geometry.boundingSphere){
		bs = node.geometry.boundingSphere;
	}else{
		bs = node.boundingBox.getBoundingSphere(new THREE.Sphere());
	}

	bs = bs.clone().applyMatrix4(node.matrixWorld);
	let radius = bs.radius;
	let fovr = camera.fov * Math.PI / 180;

	if(camera.aspect < 1){
		fovr = fovr * camera.aspect;
	}

	let distanceFactor = Math.abs(radius / Math.sin(fovr / 2)) * factor;

	let offset = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-distanceFactor);
	camera.position.copy(bs.center.clone().add(offset));
}

/**
 * Ported from the `THREE.OrthographicCamera.prototype.zoomTo` monkeypatch.
 * The original implementation only refreshes the projection matrix; frustum
 * sizing is handled by callers via `Viewer.renderDefault()`.
 *
 * @param {THREE.OrthographicCamera} camera
 * @param {*} node - object with a `geometry` or `boundingBox`
 * @param {number} [factor=1]
 */
export function zoomToOrthographic(camera, node, factor = 1){
	if(!node.geometry && !node.boundingBox){
		return;
	}

	camera.updateProjectionMatrix();
}

/**
 * Moves `camera` (perspective or orthographic) so that `node` fills the view.
 *
 * @param {THREE.Camera} camera
 * @param {*} node
 * @param {number} [factor=1]
 */
export function zoomTo(camera, node, factor = 1){
	if(camera instanceof THREE.OrthographicCamera){
		zoomToOrthographic(camera, node, factor);
	}else{
		zoomToPerspective(/** @type {THREE.PerspectiveCamera} */ (camera), node, factor);
	}
}
