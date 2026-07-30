import { z } from "zod";
export const quotationArtifactSchema = z.object({
    currency: z.string().min(1),
    quantity: z.number().positive(),
    material: z.string().min(1),
    dimensions: z.string().min(1),
    tolerance: z.string().min(1),
    finish: z.string().min(1),
    destination: z.string().min(1),
    targetDate: z.string().min(1),
    unitPrice: z.number().nonnegative(),
    toolingPrice: z.number().nonnegative(),
    leadTimeDays: z.number().int().positive(),
    binding: z.literal(false),
    assumptions: z.array(z.string()),
    conditions: z.array(z.string()),
});
export const requiredQuoteFields = [
    "quantity",
    "material",
    "dimensions",
    "tolerance",
    "finish",
    "destination",
    "targetDate",
];
//# sourceMappingURL=quote.js.map