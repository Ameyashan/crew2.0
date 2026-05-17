// Paper-craft palette + Devanagari agent labels.
// Light + dark variants are both warm/earthy.

export type Palette = {
  paper: string;
  paperDeep: string;
  paperShade: string;
  card: string;
  ink: string;
  inkSoft: string;
  inkMute: string;
  rule: string;
  marigold: string;
  marigoldDeep: string;
  stamp: string;
  leaf: string;
  tea: string;
  shadowSoft: string;
};

export const PAPER_L: Palette = {
  paper: "#f1e7d2",
  paperDeep: "#e7d9b9",
  paperShade: "#dac9a3",
  card: "#fffaef",
  ink: "#13110c",
  inkSoft: "#3a342a",
  inkMute: "#6b6354",
  rule: "#13110c1a",
  marigold: "#e8a019",
  marigoldDeep: "#c97a0b",
  stamp: "#b7311d",
  leaf: "#3f5d2f",
  tea: "#6b4a2b",
  shadowSoft: "rgba(0,0,0,.08)",
};

export const PAPER_D: Palette = {
  paper: "#15110a",
  paperDeep: "#0e0b06",
  paperShade: "#221a10",
  card: "#1d1810",
  ink: "#f1e7d2",
  inkSoft: "#cbbf9f",
  inkMute: "#867c63",
  rule: "#f1e7d224",
  marigold: "#f0b13a",
  marigoldDeep: "#e0911a",
  stamp: "#d8523e",
  leaf: "#7d9c6e",
  tea: "#d4a070",
  shadowSoft: "rgba(0,0,0,.5)",
};

export function getPalette(dark: boolean): Palette {
  return dark ? PAPER_D : PAPER_L;
}

export const AGENT_DESI: Record<string, string> = {
  apply: "अप्लाई",
  lekhak: "लेखक",
  patrakar: "पत्रकार",
  guru: "गुरु",
  khoji: "खोजी",
  mausi: "मौसी",
  pandit_q: "पंडित",
  opps: "मौके",
};
