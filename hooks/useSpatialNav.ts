"use client";

import { useEffect, useCallback, useRef } from "react";

interface SpatialNavOptions {
  /** Selector for focusable elements. Default: '[tabindex="0"]' */
  selector?: string;
  /** Base debounce delay in ms. Default: 80 */
  debounceTime?: number;
  /** Whether to wrap at grid edges. Default: true */
  wrap?: boolean;
}

type Direction = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const NAV_KEYS: Direction[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

const DIRECTION_AXIS: Record<Direction, "x" | "y"> = {
  ArrowUp: "y",
  ArrowDown: "y",
  ArrowLeft: "x",
  ArrowRight: "x",
};

function getRect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

function getCenter(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** Distance between two element centers */
function centerDistance(a: DOMRect, b: DOMRect): number {
  const ca = getCenter(a);
  const cb = getCenter(b);
  return Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2);
}

/**
 * Grid-aware candidate selection:
 * - For vertical moves (up/down), prefer elements whose center-x is within the
 *   source's horizontal span (column-preserving), else nearest column.
 * - For horizontal moves (left/right), use strict direction + nearest.
 */
function findBestCandidate(
  source: Element,
  candidates: Element[],
  direction: Direction
): Element | null {
  const srcRect = getRect(source);
  const axis = DIRECTION_AXIS[direction];
  const threshold = 12;

  let best: Element | null = null;
  let bestScore = Infinity;

  for (const cand of candidates) {
    if (cand === source) continue;
    const candRect = getRect(cand);

    // 1. Check direction (strict for x, loose for y to avoid fighting rows)
    if (direction === "ArrowRight" && candRect.left < srcRect.right - threshold) continue;
    if (direction === "ArrowLeft" && candRect.right > srcRect.left + threshold) continue;

    // Vertical: candidate must be below/above depending on direction.
    // Allow slight vertical overlap to make row transitions smooth.
    if (direction === "ArrowDown" && candRect.bottom < srcRect.top + threshold) continue;
    if (direction === "ArrowUp" && candRect.top > srcRect.bottom - threshold) continue;

    // 2. Score: primary = perpendicular-center distance, secondary = euclidean.
    // This gives column-keep behavior for up/down and row-keep for left/right.
    const score =
      axis === "y"
        ? Math.abs(getCenter(candRect).x - getCenter(srcRect).x) * 1.5 +
          centerDistance(srcRect, candRect)
        : Math.abs(getCenter(candRect).y - getCenter(srcRect).y) * 1.5 +
          centerDistance(srcRect, candRect);

    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best;
}

export function useSpatialNav(options: SpatialNavOptions = {}) {
  const {
    selector = '[tabindex="0"]',
    debounceTime = 80,
    wrap = true,
  } = options;

  const lastKeyTime = useRef(0);
  const keyHoldStart = useRef(0);
  const heldDirection = useRef<Direction | null>(null);

  const focusElement = useCallback((el: Element) => {
    const htmlEl = el as HTMLElement;
    htmlEl.focus();
    // Scroll per direction so focused element always stays visible on TV
    const rect = getRect(htmlEl);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    if (rect.top < 64) {
      window.scrollBy({ top: rect.top - 64, behavior: "smooth" });
    } else if (rect.bottom > viewportH - 16) {
      window.scrollBy({ top: rect.bottom - viewportH + 16, behavior: "smooth" });
    }
    if (rect.left < 0) {
      window.scrollBy({ left: rect.left - 8, behavior: "smooth" });
    } else if (rect.right > viewportW - 8) {
      window.scrollBy({ left: rect.right - viewportW + 8, behavior: "smooth" });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!NAV_KEYS.includes(e.key as Direction)) return;

      // Adaptive debounce: relaxed for held-key repeat after 500ms (TV remote)
      const now = Date.now();
      let effectiveDebounce = debounceTime;
      if (heldDirection.current === e.key && now - keyHoldStart.current > 500) {
        effectiveDebounce = Math.max(20, debounceTime / 2);
      } else if (heldDirection.current !== e.key) {
        keyHoldStart.current = now;
        heldDirection.current = e.key as Direction;
        effectiveDebounce = debounceTime;
      }

      if (now - lastKeyTime.current < effectiveDebounce) {
        e.preventDefault();
        return;
      }
      lastKeyTime.current = now;

      e.preventDefault();

      const current = document.activeElement;
      const source = current && current !== document.body ? current : null;
      if (!source) return;

      const focusables = Array.from(document.querySelectorAll(selector));
      if (focusables.length === 0) return;

      const best = findBestCandidate(source, focusables, e.key as Direction);

      if (best) {
        focusElement(best);
      } else if (wrap) {
        // Wrap: for Down/Right go to first of next row, Up/Left to last
        const fallback =
          e.key === "ArrowDown" || e.key === "ArrowRight"
            ? focusables[0]
            : focusables[focusables.length - 1];
        focusElement(fallback);
      }
    },
    [selector, debounceTime, wrap, focusElement]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (heldDirection.current === e.key) {
      heldDirection.current = null;
      keyHoldStart.current = 0;
    }
  }, []);

  const handleBlur = useCallback(() => {
    // Reset held state if focus leaves the document (e.g., blur to address bar)
    heldDirection.current = null;
    keyHoldStart.current = 0;
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur]);

  return { focusElement };
}