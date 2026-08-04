// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  readOverflowState,
  resolvePageDelta,
  resolveWheelDelta,
  useHorizontalOverflow,
  type ScrollMetrics
} from "./useHorizontalOverflow";

const overflowing: ScrollMetrics = { scrollLeft: 40, scrollWidth: 900, clientWidth: 300 };

describe("readOverflowState", () => {
  it("reports travel in both directions from the middle of a strip", () => {
    expect(readOverflowState(overflowing)).toEqual({
      overflowing: true,
      canScrollStart: true,
      canScrollEnd: true
    });
  });

  it("treats sub-pixel rounding as fully scrolled", () => {
    expect(readOverflowState({ scrollLeft: 0.4, scrollWidth: 900.6, clientWidth: 900 })).toEqual({
      overflowing: false,
      canScrollStart: false,
      canScrollEnd: false
    });
  });

  it("closes each edge once the strip reaches it", () => {
    expect(readOverflowState({ ...overflowing, scrollLeft: 0 }).canScrollStart).toBe(false);
    expect(readOverflowState({ ...overflowing, scrollLeft: 600 }).canScrollEnd).toBe(false);
  });
});

describe("resolveWheelDelta", () => {
  it("turns vertical wheel input into horizontal pixels", () => {
    expect(resolveWheelDelta({ deltaX: 0, deltaY: 120, deltaMode: 0 }, overflowing)).toBe(120);
  });

  it("converts line-mode deltas to pixels", () => {
    expect(resolveWheelDelta({ deltaX: 0, deltaY: -3, deltaMode: 1 }, overflowing)).toBe(-48);
  });

  it("leaves trackpad swipes to the browser", () => {
    expect(resolveWheelDelta({ deltaX: -80, deltaY: 12, deltaMode: 0 }, overflowing)).toBeNull();
  });

  it("releases the gesture at the end of the strip so the page can scroll", () => {
    const atEnd = { ...overflowing, scrollLeft: 600 };
    expect(resolveWheelDelta({ deltaX: 0, deltaY: 120, deltaMode: 0 }, atEnd)).toBeNull();
    expect(resolveWheelDelta({ deltaX: 0, deltaY: -120, deltaMode: 0 }, atEnd)).toBe(-120);
  });

  it("ignores strips that do not overflow", () => {
    const fits: ScrollMetrics = { scrollLeft: 0, scrollWidth: 300, clientWidth: 300 };
    expect(resolveWheelDelta({ deltaX: 0, deltaY: 120, deltaMode: 0 }, fits)).toBeNull();
  });
});

describe("resolvePageDelta", () => {
  it("advances by most of the visible width", () => {
    expect(resolvePageDelta(1, 400)).toBe(300);
    expect(resolvePageDelta(-1, 400)).toBe(-300);
  });

  it("keeps a usable step on very narrow strips", () => {
    expect(resolvePageDelta(1, 80)).toBe(120);
  });
});

function Strip() {
  const overflow = useHorizontalOverflow();
  return (
    <div>
      <div ref={overflow.attach} data-testid="strip" />
      <button type="button" disabled={!overflow.canScrollStart} onClick={() => overflow.scrollByPage(-1)}>
        left
      </button>
      <button type="button" disabled={!overflow.canScrollEnd} onClick={() => overflow.scrollByPage(1)}>
        right
      </button>
    </div>
  );
}

/** jsdom has no layout engine, so the strip is given its measurements directly. */
function renderStrip(metrics: ScrollMetrics) {
  render(<Strip />);
  const strip = screen.getByTestId("strip");
  strip.scrollBy = vi.fn();
  for (const [name, value] of Object.entries(metrics)) {
    Object.defineProperty(strip, name, { value, writable: true, configurable: true });
  }
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  return strip;
}

describe("useHorizontalOverflow", () => {
  it("enables only the nudges that have travel left", () => {
    renderStrip({ scrollLeft: 0, scrollWidth: 900, clientWidth: 300 });

    expect(screen.getByRole("button", { name: "left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "right" })).toBeEnabled();
  });

  it("keeps both nudges disabled when everything fits", () => {
    renderStrip({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 });

    expect(screen.getByRole("button", { name: "left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "right" })).toBeDisabled();
  });

  it("scrolls a page width from a nudge", () => {
    const strip = renderStrip({ scrollLeft: 0, scrollWidth: 900, clientWidth: 300 });

    act(() => {
      screen.getByRole("button", { name: "right" }).click();
    });

    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 225 });
  });

  it("moves the strip sideways on a vertical wheel gesture", () => {
    const strip = renderStrip({ scrollLeft: 0, scrollWidth: 900, clientWidth: 300 });
    const wheel = new WheelEvent("wheel", { deltaY: 120, cancelable: true });

    act(() => {
      strip.dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(true);
    expect(strip.scrollLeft).toBe(120);
  });

  it("leaves the wheel gesture alone once the strip is at its end", () => {
    const strip = renderStrip({ scrollLeft: 600, scrollWidth: 900, clientWidth: 300 });
    const wheel = new WheelEvent("wheel", { deltaY: 120, cancelable: true });

    act(() => {
      strip.dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(false);
    expect(strip.scrollLeft).toBe(600);
  });
});
