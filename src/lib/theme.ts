export const THEME_IDS = ["bureau", "vellum", "specter", "aperture", "verdigris", "aegis"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeOption = {
  id: ThemeId;
  label: string;
  mood: string;
  description: string;
  swatch: [string, string, string];
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "bureau",
    label: "Bureau",
    mood: "Warm operational dark",
    description: "Signal orange on archival slate — the original Radar surface.",
    swatch: ["#0a0b0e", "#ff5733", "#ede5d2"]
  },
  {
    id: "vellum",
    label: "Vellum",
    mood: "Sunlit editorial light",
    description: "Vermillion ink on warm vellum — Instrument Serif headlines, Hanken body.",
    swatch: ["#fbf6e8", "#b1311a", "#1a1410"]
  },
  {
    id: "specter",
    label: "Specter",
    mood: "Midnight phosphor dark",
    description: "Chartreuse acid over plum midnight — Unbounded display, Space Mono code.",
    swatch: ["#0a0612", "#d4ff2a", "#6be3ff"]
  },
  {
    id: "aperture",
    label: "Aperture",
    mood: "Cool analytical daylight",
    description: "Cobalt marks on architectural porcelain — precise, quiet, and inspection-first.",
    swatch: ["#eef2f4", "#0757a6", "#14212b"]
  },
  {
    id: "verdigris",
    label: "Verdigris",
    mood: "Forensic archive dark",
    description: "Burnished copper over bottle green — composed for long evidence sessions.",
    swatch: ["#07110f", "#e5a45b", "#6aa193"]
  },
  {
    id: "aegis",
    label: "Aegis",
    mood: "Command navy dark",
    description: "Glacier blue on disciplined navy — high-clarity operational command.",
    swatch: ["#07111d", "#75c8ff", "#d6a752"]
  }
];

const STORAGE_KEY = "radar.theme";

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isThemeId(stored)) {
      return stored;
    }
  } catch {
    // ignore storage failures
  }
  return "bureau";
}

export function storeTheme(themeId: ThemeId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // ignore storage failures
  }
}

export function applyTheme(themeId: ThemeId) {
  document.documentElement.dataset.theme = themeId;
}

export function themeOption(themeId: ThemeId) {
  return THEME_OPTIONS.find((entry) => entry.id === themeId) || THEME_OPTIONS[0];
}
