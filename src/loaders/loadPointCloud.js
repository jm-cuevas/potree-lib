import {PointCloudOctree} from "./PointCloudOctree.js";
import {POCLoader} from "./POCLoader.js";
import {EptLoader, CopcLoader} from "./EptLoader.js";
import {OctreeLoader} from "./octree2/OctreeLoader.js";

/**
 * Loads a point cloud, auto-detecting its format from the URL:
 * - `.../ept.json` -> EPT (laszip only, see PointCloudEptGeometry.js)
 * - `....copc.laz` -> COPC
 * - `.../cloud.js` -> legacy Potree octree ("POC")
 * - `.../metadata.json` -> Potree's current-gen binary octree ("2.0")
 *
 * @param {string} path
 * @param {string} [name]
 * @param {(result: {type: string, pointcloud: PointCloudOctree}) => void} [callback]
 * @returns {Promise<{type: string, pointcloud: PointCloudOctree}> | void} a promise if no `callback` is given
 */
export function loadPointCloud(path, name, callback) {
	let loaded = function (e) {
		e.pointcloud.name = name;
		callback(e);
	};

	let promise = new Promise((resolve) => {
		if (!path) {
			console.error(new Error("loadPointCloud() called without a path"));
		} else if (path.includes('ept.json')) {
			EptLoader.load(path, function (geometry) {
				if (!geometry) {
					console.error(new Error(`failed to load point cloud from URL: ${path}`));
				} else {
					let pointcloud = new PointCloudOctree(geometry);
					resolve({type: 'pointcloud_loaded', pointcloud: pointcloud});
				}
			});
		} else if (path.includes('.copc.laz')) {
			CopcLoader.load(path, function (geometry) {
				if (!geometry) {
					console.error(new Error(`failed to load point cloud from URL: ${path}`));
				} else {
					let pointcloud = new PointCloudOctree(geometry);
					resolve({type: 'pointcloud_loaded', pointcloud: pointcloud});
				}
			});
		} else if (path.indexOf('cloud.js') > 0) {
			POCLoader.load(path, function (geometry) {
				if (!geometry) {
					console.error(new Error(`failed to load point cloud from URL: ${path}`));
				} else {
					let pointcloud = new PointCloudOctree(geometry);
					resolve({type: 'pointcloud_loaded', pointcloud: pointcloud});
				}
			});
		} else if (path.indexOf('metadata.json') > 0) {
			OctreeLoader.load(path).then(e => {
				let geometry = e.geometry;

				if (!geometry) {
					console.error(new Error(`failed to load point cloud from URL: ${path}`));
				} else {
					let pointcloud = new PointCloudOctree(geometry);

					let aPosition = pointcloud.getAttribute("position");

					let material = pointcloud.material;
					material.elevationRange = [
						aPosition.range[0][2],
						aPosition.range[1][2],
					];

					resolve({type: 'pointcloud_loaded', pointcloud: pointcloud});
				}
			});
		} else {
			console.error(new Error(`failed to load point cloud from URL: ${path}`));
		}
	});

	if (callback) {
		promise.then(pointcloud => {
			loaded(pointcloud);
		});
	} else {
		return promise;
	}
}
