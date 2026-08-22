// potree dispatches many ad-hoc custom event types (drag/drop/select/dblclick/
// mousewheel/click/deselect/...) through THREE.Object3D's dispatchEvent, not
// just the handful three.js declares in Object3DEventMap. Widen it here
// instead of casting every dispatchEvent/addEventListener call site.
import "three";

declare module "three" {
	interface Object3DEventMap {
		[key: string]: any;
	}
}
