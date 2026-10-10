// The rule prefers `import`, but shaka-player's bundled typings are a *global*
// declaration script with no module-level `export`, so they cannot be imported
// at all -- `import ... from 'shaka-player'` is TS2306 ("File ... is not a
// module"). A reference directive is the only way to bring the global `shaka`
// namespace into scope, and this file must stay a global script (no top-level
// import/export) or the ambient declaration below stops being ambient.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../node_modules/shaka-player/dist/shaka-player.compiled.d.ts" />

/**
 * Declares the module boundary that `shaka-player` omits.
 *
 * At runtime the UMD wrapper assigns its members to `module.exports` and only
 * assigns `window.shaka` on its third branch -- the one taken when no module
 * system is present. Under a bundler `exports` is always in scope, so the
 * wrapper populates this module's exports and leaves the global permanently
 * undefined. Reading `window.shaka` therefore always yielded `undefined`.
 *
 * Declaring the module lets the component import the real value instead of
 * reading a global the bundler never populates.
 */
declare module 'shaka-player' {
  export = shaka;
}