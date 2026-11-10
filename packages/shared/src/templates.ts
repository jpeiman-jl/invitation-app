export const DEFAULT_TEMPLATE_KEYS = [
  "wedding",
  "birthday",
  "baby-shower",
  "corporate",
  "debut",
  "christening"
] as const;

export type DefaultTemplateKey = typeof DEFAULT_TEMPLATE_KEYS[number];

export interface DefaultTemplate {
  key: DefaultTemplateKey;
  name: string;
  category: string;
  description: string;
  background: string;
  surface: string;
  accent: string;
  ink: string;
  muted: string;
  displayFont: string;
  eyebrow: string;
}

export const DEFAULT_TEMPLATES: readonly DefaultTemplate[] = [
  {
    key: "wedding",
    name: "Ever After",
    category: "Wedding",
    description: "Soft florals and warm paper tones for a timeless celebration.",
    background: "#f7f2e9",
    surface: "#fffdf9",
    accent: "#8a6558",
    ink: "#322824",
    muted: "#766960",
    displayFont: "Georgia, serif",
    eyebrow: "Together with their families"
  },
  {
    key: "birthday",
    name: "Bright Day",
    category: "Birthday",
    description: "Playful color and cheerful details for a day worth celebrating.",
    background: "#fff1e9",
    surface: "#fffaf6",
    accent: "#bc4c38",
    ink: "#382521",
    muted: "#795e56",
    displayFont: "Trebuchet MS, sans-serif",
    eyebrow: "Save the date"
  },
  {
    key: "baby-shower",
    name: "Little Wonder",
    category: "Baby shower",
    description: "Gentle, airy colors to welcome a brand-new little wonder.",
    background: "#edf4f0",
    surface: "#fbfdfb",
    accent: "#547568",
    ink: "#273a34",
    muted: "#64766e",
    displayFont: "Georgia, serif",
    eyebrow: "A little one is on the way"
  },
  {
    key: "corporate",
    name: "Gather",
    category: "Corporate",
    description: "Crisp typography and confident color for a polished event.",
    background: "#edf1f8",
    surface: "#ffffff",
    accent: "#315581",
    ink: "#202d3b",
    muted: "#536273",
    displayFont: "Arial, sans-serif",
    eyebrow: "You're invited"
  },
  {
    key: "debut",
    name: "Golden Hour",
    category: "Debut",
    description: "Elegant evening tones with a celebratory golden accent.",
    background: "#f5f0e5",
    surface: "#fffdf8",
    accent: "#8b6a2d",
    ink: "#332c20",
    muted: "#70634d",
    displayFont: "Georgia, serif",
    eyebrow: "An evening to remember"
  },
  {
    key: "christening",
    name: "Grace",
    category: "Christening",
    description: "A serene, classic design for a meaningful family gathering.",
    background: "#eef0f4",
    surface: "#fcfcff",
    accent: "#5c6684",
    ink: "#2c3040",
    muted: "#686d7c",
    displayFont: "Georgia, serif",
    eyebrow: "With joy and gratitude"
  }
];
