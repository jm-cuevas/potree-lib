import * as THREE from "three";
import {EventDispatcher} from "./EventDispatcher.js";

export class PointCloudTreeNode extends EventDispatcher{

	constructor(){
		super();
		this.needsTransformUpdate = true;
	}

	getChildren(){
		throw new Error('override function');
	}

	getBoundingBox(){
		throw new Error('override function');
	}

	isLoaded(){
		throw new Error('override function');
	}

	isGeometryNode(){
		throw new Error('override function');
	}

	isTreeNode(){
		throw new Error('override function');
	}

	getLevel(){
		throw new Error('override function');
	}

	getBoundingSphere(){
		throw new Error('override function');
	}
}

export class PointCloudTree extends THREE.Object3D {
	constructor(){
		super();

		// filled in by loader-specific subclasses (Phase 2)
		this.root = null;
		this.visibleNodes = [];
	}

	initialized(){
		return this.root !== null;
	}
}
