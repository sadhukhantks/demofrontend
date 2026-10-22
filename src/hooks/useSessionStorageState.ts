"use client";

import * as React from "react";

/**
 * `useState` whose value survives in-tab navigation: it is written to
 * sessionStorage under `key` and read back on the next mount — so a list page
 * keeps its filters and page when the user opens a row and comes back
 * (TKT-000226). Per tab, gone when the tab closes; nothing is shared across
 * tabs or users.
 *
 * The first render always uses `initial` (server and client agree, no
 * hydration mismatch); the stored value is applied in a mount effect. The
 * third element says whether that restore has run, so a page can hold its
 * first fetch until the real filters are in place instead of fetching twice.
 */
export function useSessionStorageState<T>(
	key: string,
	initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
	const [value, setValue] = React.useState<T>(initial);
	const [restored, setRestored] = React.useState(false);

	React.useEffect(() => {
		const stored = readSessionStorage<T>(key);
		if (stored !== undefined) setValue(stored);
		setRestored(true);
	}, [key]);

	React.useEffect(() => {
		if (!restored) return;
		writeSessionStorage(key, value);
	}, [key, value, restored]);

	return [value, setValue, restored];
}

/** Parsed value under `key`, or undefined when absent, unreadable or not JSON. */
export function readSessionStorage<T>(key: string): T | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.sessionStorage.getItem(key);
		return raw == null ? undefined : (JSON.parse(raw) as T);
	} catch {
		return undefined;
	}
}

/** Stores `value` as JSON under `key`; silently a no-op when storage is unavailable. */
export function writeSessionStorage<T>(key: string, value: T): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, JSON.stringify(value));
	} catch {
		// quota / privacy mode: the page still works, it just forgets on return
	}
}
