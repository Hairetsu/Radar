import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

/** Sub-pixel layout rounding must not read as "there is more to scroll". */
const EDGE_TOLERANCE = 1;

/** `WheelEvent.deltaMode === DOM_DELTA_LINE` reports lines, not pixels. */
const LINE_DELTA_PIXELS = 16;

const MINIMUM_PAGE_PIXELS = 120;
const PAGE_FRACTION = 0.75;

export type ScrollMetrics = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
};

export type OverflowState = {
  overflowing: boolean;
  canScrollStart: boolean;
  canScrollEnd: boolean;
};

export type WheelIntent = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
};

const EMPTY_METRICS: ScrollMetrics = { scrollLeft: 0, scrollWidth: 0, clientWidth: 0 };

export function readOverflowState(metrics: ScrollMetrics): OverflowState {
  const overflowing = metrics.scrollWidth - metrics.clientWidth > EDGE_TOLERANCE;
  return {
    overflowing,
    canScrollStart: overflowing && metrics.scrollLeft > EDGE_TOLERANCE,
    canScrollEnd:
      overflowing && metrics.scrollLeft + metrics.clientWidth < metrics.scrollWidth - EDGE_TOLERANCE
  };
}

/**
 * A horizontal strip has no vertical travel of its own, so a vertical wheel
 * gesture over it should move it sideways. Returns the pixel delta to apply, or
 * `null` when the browser should keep the gesture: trackpad swipes already
 * scroll horizontally, and at either end the page below should scroll instead
 * of the strip swallowing the input.
 */
export function resolveWheelDelta(intent: WheelIntent, metrics: ScrollMetrics): number | null {
  const state = readOverflowState(metrics);
  if (!state.overflowing || Math.abs(intent.deltaX) > Math.abs(intent.deltaY)) {
    return null;
  }

  const delta = intent.deltaY * (intent.deltaMode === 1 ? LINE_DELTA_PIXELS : 1);
  if (delta === 0) {
    return null;
  }
  if (delta < 0 ? !state.canScrollStart : !state.canScrollEnd) {
    return null;
  }
  return delta;
}

export function resolvePageDelta(direction: -1 | 1, clientWidth: number): number {
  return direction * Math.max(clientWidth * PAGE_FRACTION, MINIMUM_PAGE_PIXELS);
}

function readMetrics(node: HTMLElement): ScrollMetrics {
  return {
    scrollLeft: Math.round(node.scrollLeft),
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth
  };
}

export type HorizontalOverflow = OverflowState & {
  attach: (node: HTMLElement | null) => void;
  scrollByPage: (direction: -1 | 1) => void;
};

/**
 * Tracks how far a horizontally scrolling strip can still travel and turns
 * vertical wheel input into horizontal movement. Layout is an external mutable
 * source, so it is read through `useSyncExternalStore` rather than mirrored
 * into state by an effect.
 */
export function useHorizontalOverflow(): HorizontalOverflow {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const cache = useRef<{ key: string; metrics: ScrollMetrics }>({ key: "", metrics: EMPTY_METRICS });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!node) {
        return () => {};
      }

      const handleWheel = (event: WheelEvent) => {
        const delta = resolveWheelDelta(event, readMetrics(node));
        if (delta === null) {
          return;
        }
        event.preventDefault();
        node.scrollLeft += delta;
      };

      node.addEventListener("scroll", onStoreChange, { passive: true });
      // Registered natively because React routes `onWheel` through a passive
      // root listener, where `preventDefault` is ignored.
      node.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("resize", onStoreChange);

      const observer =
        typeof ResizeObserver === "function" ? new ResizeObserver(onStoreChange) : null;
      observer?.observe(node);
      for (const child of Array.from(node.children)) {
        observer?.observe(child);
      }

      return () => {
        node.removeEventListener("scroll", onStoreChange);
        node.removeEventListener("wheel", handleWheel);
        window.removeEventListener("resize", onStoreChange);
        observer?.disconnect();
      };
    },
    [node]
  );

  const metrics = useSyncExternalStore(subscribe, () => {
    const next = node ? readMetrics(node) : EMPTY_METRICS;
    const key = `${next.scrollLeft}:${next.scrollWidth}:${next.clientWidth}`;
    if (cache.current.key !== key) {
      cache.current = { key, metrics: next };
    }
    return cache.current.metrics;
  });

  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      node?.scrollBy({ left: resolvePageDelta(direction, node.clientWidth) });
    },
    [node]
  );

  const state = useMemo(() => readOverflowState(metrics), [metrics]);

  return { ...state, attach: setNode, scrollByPage };
}
