/*
** Binary Heap implementation in Javascript
** From: http://eloquentjavascript.net/1st_edition/appendix2.html
**
** Copyright (c) 2007 Marijn Haverbeke, last modified on November 28 2013.
**
** Licensed under a Creative Commons attribution-noncommercial license.
** All code in this book may also be considered licensed under an MIT license.
*/

/**
 * Priority queue used by the octree LOD traversal to visit nodes in
 * closest/largest-first order.
 */
export class BinaryHeap {

	constructor(scoreFunction) {
		this.content = [];
		this.scoreFunction = scoreFunction;
	}

	push(element) {
		this.content.push(element);
		this.bubbleUp(this.content.length - 1);
	}

	pop() {
		let result = this.content[0];
		let end = this.content.pop();
		if (this.content.length > 0) {
			this.content[0] = end;
			this.sinkDown(0);
		}
		return result;
	}

	remove(node) {
		let length = this.content.length;
		for (let i = 0; i < length; i++) {
			if (this.content[i] !== node) continue;
			let end = this.content.pop();
			if (i === length - 1) break;
			this.content[i] = end;
			this.bubbleUp(i);
			this.sinkDown(i);
			break;
		}
	}

	size() {
		return this.content.length;
	}

	bubbleUp(n) {
		let element = this.content[n];
		let score = this.scoreFunction(element);
		while (n > 0) {
			let parentN = Math.floor((n + 1) / 2) - 1;
			let parent = this.content[parentN];
			if (score >= this.scoreFunction(parent)) {
				break;
			}

			this.content[parentN] = element;
			this.content[n] = parent;
			n = parentN;
		}
	}

	sinkDown(n) {
		let length = this.content.length;
		let element = this.content[n];
		let elemScore = this.scoreFunction(element);

		while (true) {
			let child2N = (n + 1) * 2;
			let child1N = child2N - 1;
			let swap = null;
			let child1Score;

			if (child1N < length) {
				let child1 = this.content[child1N];
				child1Score = this.scoreFunction(child1);
				if (child1Score < elemScore) {
					swap = child1N;
				}
			}

			if (child2N < length) {
				let child2 = this.content[child2N];
				let child2Score = this.scoreFunction(child2);
				if (child2Score < (swap === null ? elemScore : child1Score)) {
					swap = child2N;
				}
			}

			if (swap === null) break;

			this.content[n] = this.content[swap];
			this.content[swap] = element;
			n = swap;
		}
	}

}
