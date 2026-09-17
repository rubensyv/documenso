/**
 * heimWatt fork addition — see HEIMWATT.md at the repository root.
 *
 * Renders a tiny PDF with an embedded font through the same pdf.js instance and
 * canvas path as the viewer and checks that glyphs actually reached the canvas.
 *
 * Why: when a browser lacks a JavaScript API pdf.js needs, pdf.js logs
 * "getOperatorList - ignoring errors" and resolves the render anyway — the page
 * shows lines and bars but no text, and no error surfaces. `stopAtErrors` does
 * not help: measured in Firefox 115 ESR it resolves with fully blank pages.
 * Looking at the pixels is the only reliable signal.
 */
import { isLegibleRender, RENDER_CANARY_SCALE } from '@documenso/lib/heimwatt/render-failure';
import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { RENDER_CANARY_PDF_BASE64 } from './render-canary-pdf';

const decodeBase64 = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

/**
 * Resolves `true` when the canary renders legibly. Rejects when pdf.js cannot
 * load or render it at all.
 */
export const runRenderCanary = async (pdfjsLib: typeof PdfJs): Promise<boolean> => {
  const loadingTask = pdfjsLib.getDocument({ data: decodeBase64(RENDER_CANARY_PDF_BASE64) });

  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_CANARY_SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      return false;
    }

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    return isLegibleRender(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally {
    await loadingTask.destroy();
  }
};
