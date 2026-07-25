export type StageKind = "word" | "video-reading" | "pair" | "video";
export type StageColor = "leaf" | "sky" | "coral" | "sky-soft";

export interface StageDefinition {
  id: string;
  step: number;
  title: string;
  reading: string;
  kind: StageKind;
  kindLabel: string;
  color: StageColor;
}

export const STAGES: readonly StageDefinition[] = [
  {
    id: "it-words",
    step: 1,
    title: "IT単語帳",
    reading: "たんごちょう",
    kind: "word",
    kindLabel: "単語",
    color: "leaf",
  },
  {
    id: "company-structure",
    step: 2,
    title: "企業の仕組み",
    reading: "きぎょうの しくみ",
    kind: "video-reading",
    kindLabel: "動画/読解",
    color: "sky",
  },
  {
    id: "report",
    step: 3,
    title: "報告",
    reading: "ほうこく",
    kind: "pair",
    kindLabel: "ペアワーク",
    color: "coral",
  },
  {
    id: "contact",
    step: 4,
    title: "連絡",
    reading: "れんらく",
    kind: "video",
    kindLabel: "動画",
    color: "sky-soft",
  },
  {
    id: "consult",
    step: 5,
    title: "相談",
    reading: "そうだん",
    kind: "pair",
    kindLabel: "ペアワーク",
    color: "leaf",
  },
] as const;
