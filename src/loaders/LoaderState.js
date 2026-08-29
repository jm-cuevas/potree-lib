import {LRU} from "../utils/LRU.js";
import {WorkerPool} from "../utils/WorkerPool.js";

/**
 * Page-wide state shared by every octree/EPT/COPC geometry-node type, to
 * throttle concurrent node loads and cache/evict decoded node geometry.
 *
 * In the original Potree build these were `Potree.lru`/`Potree.workerPool`/
 * `Potree.numNodesLoading`/`Potree.maxNodesLoading` - module-level exports of
 * the single `src/Potree.js` entry point that every other file could reach
 * because Rollup's UMD output wraps the *entire* concatenated bundle in one
 * `function(exports){...}` factory, so a raw `exports.lru` reference from any
 * concatenated file resolved to that same shared object. That trick doesn't
 * survive a multi-entry ESM build (no shared `exports` binding across
 * separately-built subpaths), so this module is the explicit replacement:
 * anything that used to reach for `Potree.lru`/`Potree.workerPool`/etc.
 * imports it from here instead.
 */
export const lru = new LRU();

export const workerPool = new WorkerPool();

export const loaderState = {
	numNodesLoading: 0,
	maxNodesLoading: 4,
};
