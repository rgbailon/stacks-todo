/**
 * Cover palettes — the "book cover" identity of every project.
 * Add a palette here and it appears in the picker automatically.
 * `CoverTheme` is a small value object that knows how to style itself.
 */
import type { CSSProperties } from "react";

export interface PaletteSpec {
  id: string;
  name: string;
  base: string; // gradient start
  deep: string; // gradient end
  ink: string; // text on the cover
  tint: string; // light chip background on paper
  tintInk: string; // text on the tint
}

export const PALETTES: PaletteSpec[] = [
  { id: "ember",    name: "Ember",    base: "#C4552B", deep: "#8E3A1B", ink: "#FFF3E9", tint: "#F6E3D7", tintInk: "#8E3A1B" },
  { id: "moss",     name: "Moss",     base: "#4E7D5B", deep: "#33573E", ink: "#F0F7EE", tint: "#E2ECDF", tintInk: "#33573E" },
  { id: "ocean",    name: "Ocean",    base: "#33628C", deep: "#22456B", ink: "#EDF4FB", tint: "#DFE9F2", tintInk: "#22456B" },
  { id: "plum",     name: "Plum",     base: "#7A5089", deep: "#573766", ink: "#F7EFFA", tint: "#EDE2F0", tintInk: "#573766" },
  { id: "amber",    name: "Amber",    base: "#C08A2E", deep: "#8F621B", ink: "#FFF6E4", tint: "#F4E8CF", tintInk: "#8F621B" },
  { id: "rose",     name: "Rose",     base: "#B25C74", deep: "#84394F", ink: "#FDF0F3", tint: "#F3E0E5", tintInk: "#84394F" },
  { id: "teal",     name: "Teal",     base: "#2F8078", deep: "#1E5A54", ink: "#EAF6F4", tint: "#DCEDEA", tintInk: "#1E5A54" },
  { id: "graphite", name: "Graphite", base: "#5A5A64", deep: "#3B3B44", ink: "#F2F2F5", tint: "#E6E6EA", tintInk: "#3B3B44" },
];

export class CoverTheme {
  constructor(public readonly spec: PaletteSpec) {}

  static for(id: string): CoverTheme {
    return new CoverTheme(PALETTES.find((p) => p.id === id) ?? PALETTES[0]);
  }

  static random(): CoverTheme {
    return new CoverTheme(PALETTES[Math.floor(Math.random() * PALETTES.length)]);
  }

  get gradient(): string {
    return `linear-gradient(160deg, ${this.spec.base} 0%, ${this.spec.deep} 100%)`;
  }

  /** Style for the cover surface itself. */
  coverStyle(): CSSProperties {
    return { background: this.gradient, color: this.spec.ink };
  }

  /** Style for a small category/identity chip on paper. */
  chipStyle(): CSSProperties {
    return { background: this.spec.tint, color: this.spec.tintInk };
  }
}

/** Deterministic decorative pattern per project, so every cover feels distinct. */
export function patternFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 6;
}