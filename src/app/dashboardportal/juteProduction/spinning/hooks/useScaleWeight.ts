"use client";

import * as React from "react";

// The weighing-scale bridge runs on the OPERATOR's own PC, so this has to be a
// browser-side fetch — proxying it through the Next server would poll the wrong
// machine. The bridge must therefore send `Access-Control-Allow-Origin`.
// ponytail: env-overridable URL + fixed 1s poll; per-branch config only if a
// plant ever runs the bridge somewhere else.
// const SCALE_URL = process.env.NEXT_PUBLIC_SCALE_URL ?? "http://localhost:5001/apigetweight";
const SCALE_URL = process.env.NEXT_PUBLIC_SCALE_URL ?? "http://192.168.3.140:5001/api/getweight";

const POLL_MS = 1000;

/**
 * Pull a kg reading out of whatever the bridge answers — a bare number, a
 * quoted number, `{"weight": 12.34}`, `{"data":{"weight":"12.34 kg"}}`, or
 * plain text like `12.34 kg`.
 */
export function parseWeight(text: string): number | null {
	try {
		const json: unknown = JSON.parse(text);
		const candidate =
			typeof json === "object" && json !== null
				? pick(json as Record<string, unknown>)
				: json;
		const n = Number(candidate);
		return Number.isFinite(n) ? n : null;
	} catch {
		// Not JSON — plain-text bridge. Take the first number in the payload.
		const n = Number(text.match(/-?\d+(\.\d+)?/)?.[0]);
		return Number.isFinite(n) ? n : null;
	}
}

function pick(obj: Record<string, unknown>): unknown {
	const direct = obj.weight ?? obj.gross_weight ?? obj.grossWeight ?? obj.value ?? obj.wt;
	if (direct !== undefined) return typeof direct === "string" ? parseFloat(direct) : direct;
	const data = obj.data;
	return typeof data === "object" && data !== null ? pick(data as Record<string, unknown>) : data;
}

/**
 * Live gross weight (kg) from the local weighing scale, polled once a second.
 *
 * @param enabled - poll only while the form actually wants a live reading.
 * @returns `weight` = latest reading (null until the first good one), `online` =
 *          whether the last poll succeeded, so the caller can fall back to
 *          manual entry when the bridge is down.
 */
export function useScaleWeight(enabled: boolean) {
	const [weight, setWeight] = React.useState<number | null>(null);
	const [online, setOnline] = React.useState(false);

	React.useEffect(() => {
		if (!enabled) {
			setOnline(false);
			return;
		}
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;

		const tick = async () => {
			try {
				// Timeout so a hung bridge can't stall the poll chain forever.
				const res = await fetch(SCALE_URL, {
					cache: "no-store",
					signal: AbortSignal.timeout(POLL_MS * 2),
				});
				const value = res.ok ? parseWeight(await res.text()) : null;
				if (alive) {
					setOnline(value != null);
					if (value != null) setWeight(value);
				}
			} catch {
				// Bridge unreachable — keep the last reading, just flag it stale.
				if (alive) setOnline(false);
			}
			if (alive) timer = setTimeout(tick, POLL_MS);
		};

		void tick();
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [enabled]);

	return { weight, online };
}
