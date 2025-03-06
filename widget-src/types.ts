export type CardType =
  | "Business Outcome"
  | "Product Outcome"
  | "Objective"
  | "Key Result"
  | "Opportunity"
  | "Solution"
  | "Assumption"
  | "Experiment"
;

export const cardTypes: CardType[] = [
  "Business Outcome",
  "Product Outcome",
  "Objective",
  "Key Result",
  "Opportunity",
  "Solution",
  "Assumption",
  "Experiment"
]

export const cardHierarchyRanking: { [t in CardType]: number} = {
  "Business Outcome": 1,
  "Product Outcome": 2,
  "Objective": 1,
  "Key Result": 2,
  "Opportunity": 3,
  "Solution": 4,
  "Assumption": 5,
  "Experiment": 6
}

export const cardColors: { [t in CardType]: string } = {
  "Business Outcome": "#ddb3ff",
  "Product Outcome":  "#9dd8fd",
  "Objective":        "#ddb3ff",
  "Key Result":       "#9dd8fd",
  "Opportunity":      "#8cebb5",
  "Solution":         "#fdde85",
  "Assumption":       "#ffb8b4",
  "Experiment":       "#d9d9d9"
}

export const cartTypeRelations: { [t in CardType]: { parent: CardType|null, child: CardType|null }} = {
  "Business Outcome": { parent: null,                 child: "Product Outcome"  },
  "Product Outcome":  { parent: "Business Outcome",   child: "Opportunity"      },
  "Objective":        { parent: null,                 child: "Key Result"       },
  "Key Result":       { parent: "Objective",          child: "Opportunity"      },
  "Opportunity":      { parent: "Product Outcome",    child: "Solution"         },
  "Solution":         { parent: "Opportunity",        child: "Assumption"       },
  "Assumption":       { parent: "Solution",           child: "Experiment"       },
  "Experiment":       { parent: "Assumption",         child: null               }
}

export interface CardStatusUI {
    color: string
}

export type CardStatusType = 
    | "New"
    | "Discovery"
    | "Candidate"
    | "Planned"
    | "In progress"
    | "Done"
    | "On hold"
    | "Backlog"
    | "Blocked"
    | "Won't do"
;

export const cardStatuses: { [ s in CardStatusType]:CardStatusUI } = {
    "New":          { color: "#d4d5d8" },
    "Discovery":    { color: "#54c7ec" },
    "Candidate":    { color: "#9747ff" },
    "Planned":      { color: "#3578e5" },
    "In progress":  { color: "#ffba00" },
    "Done":         { color: "#00a400" },
    "On hold":      { color: "#a4a6a8" },
    "Backlog":      { color: "#d4d5d8" },
    "Blocked":      { color: "#e13238" },
    "Won't do":     { color: "#666" },
}

export type Link = {
  key: string,
  text: string,
  url: string
}