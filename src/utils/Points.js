import * as THREE from "three";

/**
 * A growable, attribute-keyed set of points (parallel typed arrays keyed by
 * attribute name), plus a bounding box. Used to accumulate the results of a
 * profile query across octree nodes.
 */
export class Points {

	constructor(){
		this.boundingBox = new THREE.Box3();
		this.numPoints = 0;
		/** @type {Object<string, {constructor: any, length: number, set: Function}>} */
		this.data = {};
	}

	/**
	 * Appends another `Points` set, merging shared attributes and zero-expanding
	 * any attribute present on only one side.
	 *
	 * @param {Points} points
	 */
	add(points){
		let currentSize = this.numPoints;
		let additionalSize = points.numPoints;
		let newSize = currentSize + additionalSize;

		let thisAttributes = Object.keys(this.data);
		let otherAttributes = Object.keys(points.data);
		let attributes = new Set([...thisAttributes, ...otherAttributes]);

		for(let attribute of attributes){
			if(thisAttributes.includes(attribute) && otherAttributes.includes(attribute)){
				// attribute in both, merge
				let Type = this.data[attribute].constructor;
				let merged = new Type(this.data[attribute].length + points.data[attribute].length);
				merged.set(this.data[attribute], 0);
				merged.set(points.data[attribute], this.data[attribute].length);
				this.data[attribute] = merged;
			}else if(thisAttributes.includes(attribute) && !otherAttributes.includes(attribute)){
				// attribute only in this; take over and expand to new size
				let elementsPerPoint = this.data[attribute].length / this.numPoints;
				let Type = this.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(this.data[attribute], 0);
				this.data[attribute] = expanded;
			}else if(!thisAttributes.includes(attribute) && otherAttributes.includes(attribute)){
				// attribute only in points to be added; take over and expand to new size
				let elementsPerPoint = points.data[attribute].length / points.numPoints;
				let Type = points.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(points.data[attribute], elementsPerPoint * currentSize);
				this.data[attribute] = expanded;
			}
		}

		this.numPoints = newSize;

		this.boundingBox.union(points.boundingBox);
	}
}
