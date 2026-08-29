import * as TWEEN from "@tweenjs/tween.js";

/**
 * Shared tween group for every camera / annotation / path animation in the
 * library.
 *
 * `@tweenjs/tween.js` v23+ dropped the implicit global group, so a plain
 * `new TWEEN.Tween(obj)` is no longer advanced by `TWEEN.update()`. Every tween
 * in this package is instead constructed against this group
 * (`new TWEEN.Tween(obj, tweens)`), and `Viewer.loop()` ticks it once per frame
 * via `tweens.update(timestamp)`.
 */
export const tweens = new TWEEN.Group();
