import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { readSessionStorage, useSessionStorageState, writeSessionStorage } from "./useSessionStorageState";

type Filters = { search: string; page: number };
const KEY = "test.filters";
const INITIAL: Filters = { search: "", page: 0 };

describe("useSessionStorageState (TKT-000226)", () => {
	beforeEach(() => window.sessionStorage.clear());

	it("starts from the initial value and reports restored after mount", () => {
		const { result } = renderHook(() => useSessionStorageState(KEY, INITIAL));
		const [value, , restored] = result.current;
		expect(value).toEqual(INITIAL);
		expect(restored).toBe(true);
	});

	it("writes updates to sessionStorage", () => {
		const { result } = renderHook(() => useSessionStorageState(KEY, INITIAL));
		act(() => result.current[1]({ search: "MR/12", page: 2 }));
		expect(readSessionStorage<Filters>(KEY)).toEqual({ search: "MR/12", page: 2 });
	});

	it("restores a stored value on the next mount (come back from an edit page)", () => {
		writeSessionStorage(KEY, { search: "jute", page: 3 });
		const { result } = renderHook(() => useSessionStorageState(KEY, INITIAL));
		expect(result.current[0]).toEqual({ search: "jute", page: 3 });
		expect(result.current[2]).toBe(true);
	});

	it("supports functional updates", () => {
		const { result } = renderHook(() => useSessionStorageState(KEY, INITIAL));
		act(() => result.current[1]((prev) => ({ ...prev, page: prev.page + 1 })));
		expect(result.current[0].page).toBe(1);
	});

	it("ignores unreadable stored JSON", () => {
		window.sessionStorage.setItem(KEY, "{not json");
		const { result } = renderHook(() => useSessionStorageState(KEY, INITIAL));
		expect(result.current[0]).toEqual(INITIAL);
	});
});
