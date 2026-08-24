import * as THREE from "three";
import {Version} from "./Version.js";
import {XHRFactory} from "../utils/XHRFactory.js";
import {workerPool, loaderState} from "./LoaderState.js";

const workerURL = new URL("../workers/BinaryDecoderWorker.js", import.meta.url).href;

export class BinaryLoader {

	constructor(version, boundingBox, scale) {
		if (typeof (version) === 'string') {
			this.version = new Version(version);
		} else {
			this.version = version;
		}

		this.boundingBox = boundingBox;
		this.scale = scale;
	}

	load(node) {
		if (node.loaded) {
			return;
		}

		let url = node.getURL();

		if (this.version.equalOrHigher('1.4')) {
			url += '.bin';
		}

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if ((xhr.status === 200 || xhr.status === 0) && xhr.response !== null) {
					let buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					throw new Error(`Failed to load file! HTTP status: ${xhr.status}, file: ${url}`);
				}
			}
		};

		try {
			xhr.send(null);
		} catch (e) {
			console.log('error loading point cloud: ' + e);
		}
	}

	parse(node, buffer) {
		let pointAttributes = node.pcoGeometry.pointAttributes;

		if (this.version.upTo('1.5')) {
			node.numPoints = buffer.byteLength / node.pcoGeometry.pointAttributes.byteSize;
		}

		let worker = workerPool.getWorker(workerURL);

		worker.onmessage = (e) => {
			let data = e.data;
			let buffers = data.attributeBuffers;
			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(data.tightBoundingBox.max),
			);

			workerPool.returnWorker(workerURL, worker);

			let geometry = new THREE.BufferGeometry();

			for (let property in buffers) {
				let buf = buffers[property].buffer;
				let batchAttribute = buffers[property].attribute;

				if (property === "POSITION_CARTESIAN") {
					geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf), 3));
				} else if (property === "rgba") {
					geometry.setAttribute("rgba", new THREE.BufferAttribute(new Uint8Array(buf), 4, true));
				} else if (property === "NORMAL_SPHEREMAPPED") {
					geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf), 3));
				} else if (property === "NORMAL_OCT16") {
					geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf), 3));
				} else if (property === "NORMAL") {
					geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf), 3));
				} else if (property === "INDICES") {
					let bufferAttribute = new THREE.BufferAttribute(new Uint8Array(buf), 4);
					bufferAttribute.normalized = true;
					geometry.setAttribute('indices', bufferAttribute);
				} else if (property === "SPACING") {
					let bufferAttribute = new THREE.BufferAttribute(new Float32Array(buf), 1);
					geometry.setAttribute('spacing', bufferAttribute);
				} else {
					const bufferAttribute = new THREE.BufferAttribute(new Float32Array(buf), 1);

					bufferAttribute.potree = {
						offset: buffers[property].offset,
						scale: buffers[property].scale,
						preciseBuffer: buffers[property].preciseBuffer,
						range: batchAttribute.range,
					};

					geometry.setAttribute(property, bufferAttribute);

					const attribute = pointAttributes.attributes.find(a => a.name === batchAttribute.name);
					attribute.range[0] = Math.min(attribute.range[0], batchAttribute.range[0]);
					attribute.range[1] = Math.max(attribute.range[1], batchAttribute.range[1]);

					if (node.getLevel() === 0) {
						attribute.initialRange = batchAttribute.range;
					}
				}
			}

			tightBoundingBox.max.sub(tightBoundingBox.min);
			tightBoundingBox.min.set(0, 0, 0);

			let numPoints = e.data.buffer.byteLength / pointAttributes.byteSize;

			node.numPoints = numPoints;
			node.geometry = geometry;
			node.mean = new THREE.Vector3(...data.mean);
			node.tightBoundingBox = tightBoundingBox;
			node.loaded = true;
			node.loading = false;
			node.estimatedSpacing = data.estimatedSpacing;
			loaderState.numNodesLoading--;
		};

		let message = {
			buffer: buffer,
			pointAttributes: pointAttributes,
			version: this.version.version,
			min: [node.boundingBox.min.x, node.boundingBox.min.y, node.boundingBox.min.z],
			offset: [node.pcoGeometry.offset.x, node.pcoGeometry.offset.y, node.pcoGeometry.offset.z],
			scale: this.scale,
			spacing: node.spacing,
			hasChildren: node.hasChildren,
			name: node.name,
		};
		worker.postMessage(message, [message.buffer]);
	}

}
