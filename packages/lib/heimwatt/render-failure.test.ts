import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMBED_RENDER_FAILED_ACTION,
  isEmbedded,
  isLegibleRender,
  PAGE_RENDER_TIMEOUT_MS,
  postRenderFailure,
  startRenderWatchdog,
} from './render-failure';

const pixels = (dark: number, light: number, lightAlpha = 255) => {
  const data: number[] = [];

  for (let index = 0; index < dark; index += 1) {
    data.push(0, 0, 0, 255);
  }

  for (let index = 0; index < light; index += 1) {
    data.push(255, 255, 255, lightAlpha);
  }

  return new Uint8ClampedArray(data);
};

describe('isLegibleRender', () => {
  it('accepts a canary render with visible glyphs (8.45 % dark measured in Firefox 115)', () => {
    expect(isLegibleRender(pixels(845, 9155))).toBe(true);
  });

  it('rejects a blank canary render (fonts dropped by pdf.js)', () => {
    expect(isLegibleRender(pixels(0, 10000))).toBe(false);
  });

  it('rejects a render below the 2 % threshold', () => {
    expect(isLegibleRender(pixels(19, 981))).toBe(false);
  });

  it('accepts a render at the 2 % threshold', () => {
    expect(isLegibleRender(pixels(20, 980))).toBe(true);
  });

  it('does not count fully transparent pixels as dark', () => {
    expect(isLegibleRender(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });

  it('rejects empty pixel data', () => {
    expect(isLegibleRender(new Uint8ClampedArray())).toBe(false);
  });
});

describe('postRenderFailure', () => {
  it('posts the failure to the embedding window', () => {
    const postMessage = vi.fn();
    const win = { parent: { postMessage } };

    expect(postRenderFailure(win, { reason: 'page-render-timeout', pageNumber: 5 })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { action: EMBED_RENDER_FAILED_ACTION, data: { reason: 'page-render-timeout', pageNumber: 5 } },
      '*',
    );
  });

  it('does nothing outside an embed', () => {
    const win = { parent: undefined as unknown as { postMessage: () => void } };
    win.parent = win as unknown as { postMessage: () => void };

    expect(isEmbedded(win)).toBe(false);
    expect(postRenderFailure(win, { reason: 'document-load-failed' })).toBe(false);
  });
});

describe('startRenderWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once the timeout elapses', () => {
    const onTimeout = vi.fn();

    startRenderWatchdog(onTimeout);
    vi.advanceTimersByTime(PAGE_RENDER_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not fire after stop', () => {
    const onTimeout = vi.fn();

    const watchdog = startRenderWatchdog(onTimeout);
    watchdog.stop();
    vi.advanceTimersByTime(PAGE_RENDER_TIMEOUT_MS * 2);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
