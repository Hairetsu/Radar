import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Type scale steps declared in styles.css under `@theme`. */
const fontSizes = ["nano", "micro", "label", "meta", "body", "lead", "title", "head", "hero", "mark"];

/** Tracking steps declared in styles.css under `@theme`. */
const trackings = ["data", "key", "label", "eyebrow", "banner"];

/**
 * tailwind-merge cannot tell a custom `text-*` size from a `text-*` colour, so
 * without this it treats `text-meta` as a colour and drops it whenever a real
 * colour like `text-muted` is merged in. Registering the scales keeps sizes and
 * colours in separate conflict groups.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: fontSizes }],
      tracking: [{ tracking: trackings }]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
