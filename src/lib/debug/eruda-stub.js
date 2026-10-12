/**
 * No-op stand-in for the `eruda` module.
 *
 * `next.config.ts` substitutes this file for `eruda` in every build that does
 * not explicitly opt in with `NEXT_PUBLIC_FAIRPLAY_DEBUG=1`. That is what keeps
 * the ~485 kB inspector library out of production output entirely, rather than
 * merely out of production network requests - a runtime guard alone cannot do
 * this, because Next compiles an unset `NEXT_PUBLIC_*` variable to a member
 * lookup rather than a literal, so the import branch is not statically dead.
 *
 * The shape mirrors the eruda methods DebugBoot calls, so if this module
 * is ever reached the failure is silent and benign: `init` mounts no panel,
 * `get` returns nothing, and no DOM, storage, cookie or network API is touched.
 * Nothing here can observe or expose anything.
 *
 * Note that DebugBoot still attaches the debug sink after calling `init()`, so
 * even on this path `emit()` keeps writing redacted records to `console.info`.
 * That is a plain console log - no inspector UI, no storage view, no network
 * capture - and every record is redacted by construction, so nothing sensitive
 * can reach it. The practical path here is unreachable anyway: the stub is only
 * installed when `NEXT_PUBLIC_FAIRPLAY_DEBUG` is unset, and the gate refuses
 * that same build before the import is ever attempted.
 */
module.exports = {
  init() {},
  get() {
    return undefined;
  },
  show() {
    return undefined;
  },
  position() {
    return undefined;
  },
  destroy() {},
};
