import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import {tweens} from "../../utils/tweens.js";
import {EventDispatcher} from "../../core/EventDispatcher.js";
import {moveTo} from "../../utils/camera.js";

/**
 * Headless annotation data/tree model: position, title, description, camera
 * view, visibility, and hierarchy. An `Annotation` with no args is also used
 * as the root of an annotation tree (see `Scene.annotations`).
 *
 * DOM rendering of annotation popups (title bar, description box, action
 * icons, drag handles) is intentionally not part of this package - build
 * that layer in the consuming application using this data model plus the
 * `annotation_added` / `visibility_changed` / `annotation_changed` events.
 */
export class Annotation extends EventDispatcher {
	constructor(args = {}){
		super();

		this.scene = null;
		this._title = args.title || 'No Title';
		this._description = args.description || '';
		this.offset = new THREE.Vector3();
		this.uuid = THREE.MathUtils.generateUUID();

		if(!args.position){
			this.position = null;
		}else if(args.position.x != null){
			this.position = args.position;
		}else{
			this.position = new THREE.Vector3(...args.position);
		}

		this.cameraPosition = (args.cameraPosition instanceof Array)
			? new THREE.Vector3().fromArray(args.cameraPosition) : args.cameraPosition;
		this.cameraTarget = (args.cameraTarget instanceof Array)
			? new THREE.Vector3().fromArray(args.cameraTarget) : args.cameraTarget;
		this.radius = args.radius;
		this.view = args.view || null;
		this.actions = args.actions || [];
		this.isHighlighted = false;
		this._visible = true;
		this.collapseThreshold = [args.collapseThreshold, 100].find(e => e !== undefined);

		this.children = [];
		this.parent = null;
		this.boundingBox = new THREE.Box3();
	}

	get visible(){
		return this._visible;
	}

	set visible(value){
		if(this._visible === value){
			return;
		}

		this._visible = value;

		this.dispatchEvent({
			type: 'visibility_changed',
			annotation: this
		});
	}

	get title(){
		return this._title;
	}

	set title(title){
		if(this._title === title){
			return;
		}

		this._title = title;

		this.dispatchEvent({
			type: "annotation_changed",
			annotation: this,
		});
	}

	get description(){
		return this._description;
	}

	set description(description){
		if(this._description === description){
			return;
		}

		this._description = description;

		this.dispatchEvent({
			type: "annotation_changed",
			annotation: this,
		});
	}

	add(annotation){
		if(!this.children.includes(annotation)){
			this.children.push(annotation);
			annotation.parent = this;

			let descendants = [];
			annotation.traverse(a => { descendants.push(a); });

			for(let descendant of descendants){
				let c = this;
				while(c !== null){
					c.dispatchEvent({
						type: 'annotation_added',
						annotation: descendant
					});
					c = c.parent;
				}
			}
		}
	}

	level(){
		if(this.parent === null){
			return 0;
		}

		return this.parent.level() + 1;
	}

	hasChild(annotation){
		return this.children.includes(annotation);
	}

	remove(annotation){
		if(this.hasChild(annotation)){
			annotation.removeAllChildren();
			this.children = this.children.filter(e => e !== annotation);
			annotation.parent = null;
		}
	}

	removeAllChildren(){
		this.children.forEach((child) => {
			if(child.children.length > 0){
				child.removeAllChildren();
			}

			this.remove(child);
		});
	}

	updateBounds(){
		let box = new THREE.Box3();

		if(this.position){
			box.expandByPoint(this.position);
		}

		for(let child of this.children){
			child.updateBounds();

			box.union(child.boundingBox);
		}

		this.boundingBox.copy(box);
	}

	traverse(handler){
		let expand = handler(this);

		if(expand === undefined || expand === true){
			for(let child of this.children){
				child.traverse(handler);
			}
		}
	}

	traverseDescendants(handler){
		for(let child of this.children){
			child.traverse(handler);
		}
	}

	flatten(){
		let annotations = [];

		this.traverse(annotation => {
			annotations.push(annotation);
		});

		return annotations;
	}

	descendants(){
		let annotations = [];

		this.traverse(annotation => {
			if(annotation !== this){
				annotations.push(annotation);
			}
		});

		return annotations;
	}

	hasView(){
		let hasPosTargetView = this.cameraTarget?.x != null;
		hasPosTargetView = hasPosTargetView && this.cameraPosition?.x != null;

		let hasRadiusView = this.radius !== undefined;

		return hasPosTargetView || hasRadiusView;
	}

	/**
	 * Animates the scene's active view to this annotation's stored camera view.
	 */
	moveHere(camera){
		if(!this.hasView()){
			return;
		}

		let view = this.scene.view;
		let animationDuration = 500;
		let easing = TWEEN.Easing.Quartic.Out;

		let endTarget;
		if(this.cameraTarget){
			endTarget = this.cameraTarget;
		}else if(this.position){
			endTarget = this.position;
		}else{
			endTarget = this.boundingBox.getCenter(new THREE.Vector3());
		}

		if(this.cameraPosition){
			let endPosition = this.cameraPosition;

			moveTo(this.scene, endPosition, endTarget);
		}else if(this.radius){
			let direction = view.direction;
			let endPosition = endTarget.clone().add(direction.multiplyScalar(-this.radius));
			let startRadius = view.radius;
			let endRadius = this.radius;

			{ // animate camera position
				let tween = new TWEEN.Tween(view.position, tweens).to(endPosition, animationDuration);
				tween.easing(easing);
				tween.start();
			}

			{ // animate radius
				let t = {x: 0};

				let tween = new TWEEN.Tween(t, tweens)
					.to({x: 1}, animationDuration)
					.onUpdate(function(){
						view.radius = this.x * endRadius + (1 - this.x) * startRadius;
					});
				tween.easing(easing);
				tween.start();
			}
		}
	}

	toString(){
		return 'Annotation: ' + this._title;
	}
}
