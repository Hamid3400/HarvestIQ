import { z } from "zod";

export const scanBodySchema = z.object({
  language: z.enum(["en", "yo", "ha", "ig"]).default("en"),
});

// What we allow Gemini's answer to look like. Anything else is rejected.
export const scanResultSchema = z.object({
  isCrop: z.boolean(),
  cropName: z.string().max(60),
  quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
  ripeness: z.enum(["UNDERRIPE", "RIPE", "OVERRIPE", "NOT_APPLICABLE"]),
  healthIssues: z.array(z.string().max(120)).max(5),
  harvestAdvice: z.string().max(400),
  storageAdvice: z.string().max(400),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type ScanResult = z.infer<typeof scanResultSchema>;
export type Language = z.infer<typeof scanBodySchema>["language"];