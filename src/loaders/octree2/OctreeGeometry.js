import * as THREE from "three";
import {loaderState} from "../LoaderState.js";

export class OctreeGeometry {

	constructor() {
		this.url = null;
		this.spacing = 0;
		this.boundingBox = null;
		this.root = null;
		this.pointAttributes = null;
		this.loader = null;
		// set by OctreeLoader.load() right after construction
		this.scale = undefined;
		this.projection = null;
		this.tightBoundingBox = null;
		this.boundingSphere = null;
		this.tightBoundingSphere = null;
		this.offset = null;
	}

}

export class OctreeGeometryNode {

	constructor(name, octreeGeometry, boundingBox) {
		this.id = OctreeGeometryNode.IDCount++;
		this.name = name;
		this.index = parseInt(name.charAt(name.length - 1));
		this.octreeGeometry = octreeGeometry;
		this.boundingBox = boundingBox;
		this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		this.children = {};
		this.numPoints = 0;
		this.level = null;
		this.oneTimeDisposeHandlers = [];
		// set by NodeLoader as the hierarchy chunk covering this node is parsed
		this.parent = null;
		this.nodeType = undefined;
		this.hierarchyByteOffset = undefined;
		this.hierarchyByteSize = undefined;
		this.byteOffset = undefined;
		this.byteSize = undefined;
		this.hasChildren = false;
		this.spacing = undefined;
	}

	isGeometryNode() {
		return true;
	}

	getLevel() {
		return this.level;
	}

	isTreeNode() {
		return false;
	}

	isLoaded() {
		return this.loaded;
	}

	getBoundingSphere() {
		return this.boundingSphere;
	}

	getBoundingBox() {
		return this.boundingBox;
	}

	getChildren() {
		let children = [];

		for (let i = 0; i < 8; i++) {
			if (this.children[i]) {
				children.push(this.children[i]);
			}
		}

		return children;
	}

	load() {
		if (loaderState.numNodesLoading >= loaderState.maxNodesLoading) {
			return;
		}

		this.octreeGeometry.loader.load(this);
	}

	getNumPoints() {
		return this.numPoints;
	}

	dispose() {
		if (this.geometry && this.parent != null) {
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			for (let i = 0; i < this.oneTimeDisposeHandlers.length; i++) {
				let handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

}

OctreeGeometryNode.IDCount = 0;
