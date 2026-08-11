import type { SelectionConfig } from "./types";

/** The accepted v0.1 beta composition and diversity policy. */
export const DEFAULT_SELECTION_CONFIG = {
  version: "selection-v0.1",
  targetTotal: 10,
  targetCounts: {
    balanced: 4,
    sound: 3,
    semantic: 3,
  },
  balanced: {
    minimumAxisWeight: 0.7,
    averageAxisWeight: 0.3,
    maximumPerSemanticCluster: 2,
  },
  semantic: {
    primaryMaximumPerSemanticCluster: 1,
    fallbackMaximumPerSemanticCluster: 2,
  },
  fallbackPriority: ["balanced", "sound", "semantic"],
} as const satisfies SelectionConfig;
