/**
 * heimWatt fork addition — see HEIMWATT.md at the repository root.
 *
 * Pure logic for the embed render-failure signal. The PDF viewer
 * (`apps/remix/app/components/general/pdf-viewer/pdf-viewer.tsx`) and the render
 * canary (`apps/remix/app/components/embed/heimwatt/render-canary.ts`) use it to
 * tell the embedding page that the customer is looking at pages that did not
 * render, so the host can explain the situation and offer a way out.
 *
 * Kept free of React, pdf.js and Documenso imports so it can be unit-tested and
 * never conflicts with an upstream merge.
 */

/**
 * postMessage action sent to the embedding window. Additive to Documenso's embed
 * contract: hosts that do not know it ignore it (their switch has no default).
 */
export const EMBED_RENDER_FAILED_ACTION = 'document-render-failed';

export type EmbedRenderFailureReason =
  /** The PDF could not be fetched or parsed. */
  | 'document-load-failed'
  /** pdf.js rejected rendering a page. */
  | 'page-render-failed'
  /** A page render did not settle within `PAGE_RENDER_TIMEOUT_MS`. */
  | 'page-render-timeout'
  /** The render canary produced no visible glyphs (fonts silently dropped). */
  | 'render-capability-failed';

export type EmbedRenderFailure = {
  reason: EmbedRenderFailureReason;
  /** 1-based page number for page-level failures. */
  pageNumber?: number;
};

/**
 * A page render that has not settled after this long is treated as hung.
 *
 * Measured 2026-09-17 in Firefox 115 ESR with the legacy pdf.js build at the
 * viewer's high resolution (scale 3.4): 39–59 ms per page for a 12-page
 * contract-like PDF with a raster image and tables. 20 s leaves several hundred
 * times that for old hardware. Hung renders never settle, so a longer value only
 * delays the explanation without catching more cases.
 */
export const PAGE_RENDER_TIMEOUT_MS = 20_000;

/** Render scale for the canary page (60 × 20 mm → 339 × 113 px). */
export const RENDER_CANARY_SCALE = 2;

/**
 * Minimum share of dark pixels for the canary render to count as legible.
 *
 * Measured 2026-09-17 in Firefox 115 ESR: 8.45 % when glyphs render (legacy
 * build), 0 % when pdf.js silently drops the embedded font (modern build). 2 %
 * sits well between both.
 */
export const RENDER_CANARY_MIN_DARK_RATIO = 0.02;

const DARK_LUMINANCE_THRESHOLD = 128;

/**
 * Whether RGBA pixel data from the canary render contains enough dark pixels to
 * show the canary's glyphs.
 */
export const isLegibleRender = (rgba: ArrayLike<number>): boolean => {
  const pixelCount = Math.floor(rgba.length / 4);

  if (pixelCount === 0) {
    return false;
  }

  let darkPixels = 0;

  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const alpha = rgba[offset + 3];

    if (alpha === 0) {
      continue;
    }

    const luminance = (rgba[offset] * 299 + rgba[offset + 1] * 587 + rgba[offset + 2] * 114) / 1000;

    if (luminance < DARK_LUMINANCE_THRESHOLD) {
      darkPixels += 1;
    }
  }

  return darkPixels / pixelCount >= RENDER_CANARY_MIN_DARK_RATIO;
};

type EmbedWindow = {
  parent: EmbedWindow | { postMessage: (message: unknown, targetOrigin: string) => void };
};

/** True when the page runs inside a frame, i.e. as an embed. */
export const isEmbedded = (win: EmbedWindow): boolean => win.parent !== win;

/**
 * Sends the render failure to the embedding window. Does nothing outside an
 * embed. Returns whether a message was posted.
 */
export const postRenderFailure = (win: EmbedWindow, failure: EmbedRenderFailure): boolean => {
  if (!isEmbedded(win) || !('postMessage' in win.parent)) {
    return false;
  }

  win.parent.postMessage({ action: EMBED_RENDER_FAILED_ACTION, data: failure }, '*');

  return true;
};

export type RenderWatchdog = {
  stop: () => void;
};

/**
 * Calls `onTimeout` once if `stop` is not called within `timeoutMs`.
 */
export const startRenderWatchdog = (
  onTimeout: () => void,
  timeoutMs: number = PAGE_RENDER_TIMEOUT_MS,
): RenderWatchdog => {
  const timer = setTimeout(onTimeout, timeoutMs);

  return {
    stop: () => clearTimeout(timer),
  };
};
