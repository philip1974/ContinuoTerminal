/**
 * WebGL renderer's GPU character atlas (texture cache of rendered glyphs) is
 * known to corrupt in three scenarios xterm.js does not handle itself:
 *
 *   1. Window goes background → returns to foreground. macOS may reclaim GPU
 *      resources; the atlas index survives but the underlying texture pixels
 *      are stale, so every cell renders the wrong glyph.
 *   2. devicePixelRatio change (Retina ↔ external display, window dragged
 *      across monitors). Cell pixel dimensions recompute but the atlas was
 *      built at the old DPR.
 *   3. Sleep / wake. WebGL context is fully lost; onContextLoss handles the
 *      worst case but a soft loss (atlas pixels gone, context still alive)
 *      doesn't trigger the callback.
 *
 * Symptom in all three: every glyph renders as a random other glyph from the
 * atlas. Workaround that always restores: any resize triggers atlas rebuild.
 * Direct fix: call `term.clearTextureAtlas()` on the same wake-up signals.
 * No-op on DOM renderer (method exists but draws nothing to clear).
 *
 * Mirrors VSCode terminal's atlas-recovery hooks.
 *
 * Caller-supplied `term` MUST be a real xterm Terminal instance; we feature-
 * detect `clearTextureAtlas` so older xterm versions (or unit-test mocks
 * without the method) degrade silently rather than throw.
 */

export type AtlasGuardsDisposable = Readonly<{ dispose: () => void }>;

type ClearableTerm = Readonly<{
  clearTextureAtlas?: () => void;
}>;

export function installAtlasGuards(term: ClearableTerm): AtlasGuardsDisposable {
  // Server-side / non-DOM hosts (jsdom without window) → no-op.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { dispose: () => {} };
  }

  const clearAtlas = () => {
    try {
      term.clearTextureAtlas?.();
    } catch {
      /* term disposed mid-event — ignore */
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') clearAtlas();
  };
  const onFocus = () => clearAtlas();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);

  // DPR change: matchMedia fires `change` exactly once when the resolution
  // crosses the boundary the mql was constructed against. Rebuild a fresh mql
  // each fire so we keep listening for the next change.
  // jsdom lacks matchMedia; treat as absent and skip the DPR branch.
  const supportsMql = typeof window.matchMedia === 'function';
  let activeMql: MediaQueryList | null = null;
  const dprListener = () => {
    clearAtlas();
    rebuildDprMql();
  };
  const rebuildDprMql = () => {
    if (!supportsMql) return;
    activeMql?.removeEventListener('change', dprListener);
    activeMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    activeMql.addEventListener('change', dprListener);
  };
  rebuildDprMql();

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      activeMql?.removeEventListener('change', dprListener);
      activeMql = null;
    },
  };
}
