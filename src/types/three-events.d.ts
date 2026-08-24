// potree dispatches many ad-hoc custom event types (drag/drop/select/dblclick/
// mousewheel/click/deselect/...) through THREE.Object3D's dispatchEvent, not
// just the handful three.js declares in Object3DEventMap. Widen it here
// instead of casting every dispatchEvent/addEventListener call site.
//
// THREE.Material's event map isn't a named, augmentable interface in this
// @types/three version (it's the inline literal `EventDispatcher<{dispose:
// {}}>`), so PointCloudMaterial - the one Material subclass with a wide
// custom-event surface - gets its own local dispatchEvent override instead;
// see PointCloudMaterial.js.
import "three";

declare module "three" {
	interface Object3DEventMap {
		[key: string]: any;
	}

	// Loaders stash per-attribute scale/offset/precise-value metadata directly
	// on the BufferAttribute instance (`attribute.potree = {...}`) so the
	// shader-uniform and picking code can recover original values from the
	// packed-to-f32 buffer; three.js's own type doesn't declare this field.
	interface BufferAttribute {
		potree?: any;
	}
}
