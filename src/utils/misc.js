import * as THREE from "three";

/**
 * Inserts thousands separators into a number (or numeric string).
 *
 * @param {number | string} nStr
 * @returns {string}
 */
export function addCommas(nStr){
	let s = nStr + "";
	let x = s.split(".");
	let x1 = x[0];
	let x2 = x.length > 1 ? "." + x[1] : "";
	let rgx = /(\d+)(\d{3})/;
	while(rgx.test(x1)){
		x1 = x1.replace(rgx, "$1" + "," + "$2");
	}

	return x1 + x2;
}

/**
 * Strips thousands separators added by {@link addCommas}.
 *
 * @param {string} str
 * @returns {string}
 */
export function removeCommas(str){
	return str.replace(/,/g, "");
}

/**
 * Normalizes a URL: keeps protocol/host/path, collapses repeated slashes,
 * drops the query string and hash.
 *
 * @param {string} url
 * @returns {string}
 */
export function normalizeURL(url){
	let u = new URL(url);

	return u.protocol + "//" + u.hostname + u.pathname.replace(/\/+/g, "/");
}

/**
 * Creates a `Worker` from a source-code string (via a blob URL).
 * See http://stackoverflow.com/questions/10343913
 *
 * @param {string} code
 * @returns {Worker}
 */
export function createWorker(code){
	let blob = new Blob([code], {type: "application/javascript"});

	return new Worker(URL.createObjectURL(blob));
}

/**
 * Resolves as soon as any of `promises` resolves (like `Promise.race`, but
 * ignores rejections).
 *
 * @param {Array<Promise<any>>} promises
 * @returns {Promise<void>}
 */
export function waitAny(promises){
	return new Promise((resolve) => {
		promises.map(promise => {
			promise.then(() => {
				resolve();
			});
		});
	});
}

/**
 * Brute-force search across the currently-loaded octree nodes for the point
 * whose `gps-time` attribute is closest to `target`. Returns the owning node,
 * the point index within it, and the point's world-space position.
 *
 * @param {number} target - GPS time to search for
 * @param {import("../core/Viewer.js").Viewer} viewer
 * @returns {{node: any, index: number, position: THREE.Vector3}}
 */
export function findClosestGpsTime(target, viewer){
	const start = performance.now();

	const nodes = [];
	for(const pc of viewer.scene.pointclouds){
		nodes.push(pc.root);

		for(const child of pc.root.children){
			if(child){
				nodes.push(child);
			}
		}
	}

	let closestNode = null;
	let closestIndex = Infinity;
	let closestDistance = Infinity;
	let closestValue = 0;

	for(const node of nodes){
		const isOkay = node.geometryNode != null
			&& node.geometryNode.geometry != null
			&& node.sceneNode != null;

		if(!isOkay){
			continue;
		}

		let geometry = node.geometryNode.geometry;
		let gpsTime = geometry.attributes["gps-time"];
		let range = gpsTime.potree.range;

		for(let i = 0; i < gpsTime.array.length; i++){
			let value = gpsTime.array[i];
			value = value * (range[1] - range[0]) + range[0];
			const distance = Math.abs(target - value);

			if(distance < closestDistance){
				closestIndex = i;
				closestDistance = distance;
				closestValue = value;
				closestNode = node;
			}
		}
	}

	const geometry = closestNode.geometryNode.geometry;
	const position = new THREE.Vector3(
		geometry.attributes.position.array[3 * closestIndex + 0],
		geometry.attributes.position.array[3 * closestIndex + 1],
		geometry.attributes.position.array[3 * closestIndex + 2],
	);

	position.applyMatrix4(closestNode.sceneNode.matrixWorld);

	const end = performance.now();
	console.log(`findClosestGpsTime duration: ${(end - start).toFixed(3)}ms`);

	return {
		node: closestNode,
		index: closestIndex,
		position: position,
	};
}

/**
 * Reads a query parameter from `window.location.search`.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function getParameterByName(name){
	name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
	let regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	let results = regex.exec(document.location.search);

	return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

/**
 * Writes/replaces a query parameter in the current URL (via `history.replaceState`).
 *
 * @param {string} name
 * @param {string} value
 */
export function setParameter(name, value){
	name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
	let regex = new RegExp('([\\?&])(' + name + '=([^&#]*))');
	let results = regex.exec(document.location.search);

	let url = window.location.href;
	if(results === null){
		url = url + (window.location.search.length === 0 ? '?' : '&') + name + '=' + value;
	}else{
		let newValue = name + '=' + value;
		url = url.replace(results[2], newValue);
	}
	window.history.replaceState({}, '', url);
}
