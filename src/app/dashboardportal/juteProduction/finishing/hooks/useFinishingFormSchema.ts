"use client";

import * as React from "react";
import { z } from "zod";

// Zod schema for the Finishing entry form. The captured params are dynamic
// (driven by entry_setup.param_tokens), so each token becomes an optional
// numeric-string field on a `params` record. Header fields are validated
// strictly (machine/quality/spell required; prod_qty > 0).
//
// All numeric inputs are kept as strings in the form (MUI TextField) and parsed
// at submit time — empty string => null where the field is optional.

const numericString = z
	.string()
	.refine((v) => v === "" || !Number.isNaN(Number(v)), { message: "Must be a number" });

const positiveNumericString = numericString.refine(
	(v) => v !== "" && Number(v) > 0,
	{ message: "Required and must be greater than 0" }
);

const nonNegativeNumericString = numericString.refine(
	(v) => v === "" || Number(v) >= 0,
	{ message: "Must be 0 or more" }
);

export function buildFinishingFormSchema(paramTokens: string[]) {
	const paramShape: Record<string, typeof numericString> = {};
	for (const token of paramTokens) {
		paramShape[token] = numericString;
	}
	return z.object({
		machineId: z.string().min(1, "Machine is required"),
		qualityId: z.string().min(1, "Quality is required"),
		spellId: z.string().min(1, "Spell is required"),
		ebId: z.string(),
		inputQty: nonNegativeNumericString,
		prodQty: positiveNumericString,
		wastageKg: nonNegativeNumericString,
		params: z.object(paramShape),
	});
}

export type FinishingFormValues = {
	machineId: string;
	qualityId: string;
	spellId: string;
	ebId: string;
	inputQty: string;
	prodQty: string;
	wastageKg: string;
	params: Record<string, string>;
};

// Memoized schema for a given set of param tokens.
export function useFinishingFormSchema(paramTokens: string[]) {
	const tokensKey = paramTokens.join(",");
	return React.useMemo(
		() => buildFinishingFormSchema(paramTokens),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[tokensKey]
	);
}
