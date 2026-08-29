import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import {tweens} from "./tweens.js";

/**
 * Drives a callback with a parameter `t` in [0, 1] along an {@link AnimationPath}
 * at a constant world-space speed, using a linear tween.
 */
export class PathAnimation {

	/**
	 * @param {AnimationPath} path
	 * @param {number} start - start distance along the path (world units)
	 * @param {number} end - end distance along the path (world units)
	 * @param {number} speed - world units per second
	 * @param {(t: number) => void} callback
	 */
	constructor(path, start, end, speed, callback){
		this.path = path;
		this.length = this.path.spline.getLength();
		this.speed = speed;
		this.callback = callback;
		/** @type {TWEEN.Tween<{t: number}> | null} */
		this.tween = null;
		this.startPoint = Math.max(start, 0);
		this.endPoint = Math.min(end, this.length);
		this.t = 0.0;
		this.repeat = false;
	}

	start(resume = false){
		if(this.tween){
			this.tween.stop();
			this.tween = null;
		}

		let tStart;
		if(resume){
			tStart = this.t;
		}else{
			tStart = this.startPoint / this.length;
		}
		let tEnd = this.endPoint / this.length;
		let animationDuration = (tEnd - tStart) * this.length * 1000 / this.speed;

		let progress = {t: tStart};
		this.tween = new TWEEN.Tween(progress, tweens).to({t: tEnd}, animationDuration);
		this.tween.easing(TWEEN.Easing.Linear.None);
		this.tween.onUpdate(() => {
			this.t = progress.t;
			this.callback(progress.t);
		});
		this.tween.onComplete(() => {
			if(this.repeat){
				this.start();
			}
		});

		setTimeout(() => {
			this.tween.start();
		}, 0);
	}

	stop(){
		if(!this.tween){
			return;
		}
		this.tween.stop();
		this.tween = null;
		this.t = 0;
	}

	pause(){
		if(!this.tween){
			return;
		}

		this.tween.stop();
		tweens.remove(this.tween);
		this.tween = null;
	}

	resume(){
		this.start(true);
	}

	getPoint(t){
		return this.path.spline.getPoint(t);
	}

}

/**
 * A Catmull-Rom spline through a list of control points, with helpers to sample
 * it and to run a {@link PathAnimation} along it.
 */
export class AnimationPath {

	/**
	 * @param {THREE.Vector3[]} [points=[]]
	 */
	constructor(points = []){
		this.points = points;
		this.spline = new THREE.CatmullRomCurve3(points);
		/** @type {TWEEN.Tween<any> | null} */
		this.tween = null;
	}

	get(t){
		return this.spline.getPoint(t);
	}

	getLength(){
		return this.spline.getLength();
	}

	/**
	 * @param {number} start
	 * @param {number} end
	 * @param {number} speed
	 * @param {(t: number) => void} callback
	 * @returns {PathAnimation}
	 */
	animate(start, end, speed, callback){
		let animation = new PathAnimation(this, start, end, speed, callback);
		animation.start();

		return animation;
	}

	pause(){
		if(this.tween){
			this.tween.stop();
		}
	}

	resume(){
		if(this.tween){
			this.tween.start();
		}
	}

	/**
	 * Samples the spline into a `BufferGeometry` (500 segments), suitable for a
	 * `THREE.Line` preview of the path.
	 *
	 * @returns {THREE.BufferGeometry}
	 */
	getGeometry(){
		let samples = 500;
		let points = [];
		for(let u = 0; u <= 1; u += 1 / samples){
			points.push(this.spline.getPoint(u));
		}

		if(this.closed){
			points.push(this.spline.getPoint(0));
		}

		return new THREE.BufferGeometry().setFromPoints(points);
	}

	get closed(){
		return this.spline.closed;
	}

	set closed(value){
		this.spline.closed = value;
	}

}
