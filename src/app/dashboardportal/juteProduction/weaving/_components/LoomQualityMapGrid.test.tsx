/**
 * @vitest-environment jsdom
 *
 * TKT-000119 — Loom -> Quality grid bulk tools: tick looms (header, single, shift-click
 * range), select by current quality / by an existing loom grouping across lines, set one
 * quality on all selected looms (edit state only; Save Map persists it), and open the
 * Fill-from-previous dialog. API calls are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

const fetchMock = vi.fn();
vi.mock("@/utils/apiClient2", () => ({
	fetchWithCookie: (...args: unknown[]) => fetchMock(...args),
}));

import LoomQualityMapGrid from "./LoomQualityMapGrid";
import type { LoomQualityMapRow, WeavingSetup } from "../types/weavingTypes";

function row(id: number, line: number, saved: number | null): LoomQualityMapRow {
	return {
		machine_id: id,
		mech_code: `L${String(id).padStart(3, "0")}`,
		mech_posting_code: id,
		machine_name: `Loom ${id}`,
		line_no: line,
		weaving_quality_id: saved,
		weaving_quality_code: null,
		weaving_quality_name: null,
		prev_quality_id: null,
		prev_quality_code: null,
		prev_quality_name: null,
		prev_date: null,
	};
}

const ROWS = [row(1, 1, 10), row(2, 1, 10), row(3, 1, 20), row(4, 2, 10), row(5, 2, 20)];
const SETUP: WeavingSetup = {
	spells: [{ spell_id: 102, spell_code: "A1", spell_name: "A1", working_hours: 8 }],
	qualities: [
		{ weaving_quality_id: 10, item_id: 1, weaving_quality_code: "2M401", weaving_quality_name: "SACKING_R" },
		{ weaving_quality_id: 20, item_id: 1, weaving_quality_code: "33016", weaving_quality_name: "PACKSHEET" },
	],
};

function renderGrid() {
	const refresh = vi.fn();
	render(
		<LoomQualityMapGrid
			coId="106"
			branchId={87}
			setup={SETUP}
			date="2026-10-08"
			spellId={102}
			map={{ rows: ROWS, lastUpdated: null, loading: false, carryForwardLoading: false, error: null, refresh }}
		/>
	);
	return { refresh };
}

function selectedChip() {
	return screen.getByText(/selected/);
}

async function pickOption(placeholder: string, optionName: RegExp) {
	const input = screen.getByPlaceholderText(placeholder);
	fireEvent.mouseDown(input);
	fireEvent.change(input, { target: { value: "" } });
	fireEvent.keyDown(input, { key: "ArrowDown" });
	fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

beforeEach(() => {
	fetchMock.mockReset();
	fetchMock.mockImplementation((url: string) => {
		if (url.includes("quality_map_groups")) {
			return Promise.resolve({
				data: {
					data: [
						{ source: "loom_group", group_id: 7, group_code: "WVR-01", group_name: "Weaver 1", machine_ids: [2, 4] },
						{ source: "machine_group", group_id: 8, group_code: "CRD", group_name: "Cards", machine_ids: [999] },
					],
				},
				error: null,
			});
		}
		return Promise.resolve({ data: { data: { saved: 5, skipped: 0 } }, error: null });
	});
});

describe("LoomQualityMapGrid bulk selection", () => {
	it("header tick selects the shown line only; shift-click selects a range", () => {
		renderGrid();
		expect(screen.getByText("Loom 1")).toBeInTheDocument();
		expect(screen.queryByText("Loom 4")).not.toBeInTheDocument(); // line 2 hidden
		fireEvent.click(screen.getByLabelText("Select shown looms"));
		expect(selectedChip()).toHaveTextContent("3 selected");
		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		expect(selectedChip()).toHaveTextContent("0 selected");

		fireEvent.click(screen.getByLabelText("Select loom L001"));
		fireEvent.click(screen.getByLabelText("Select loom L003"), { shiftKey: true });
		expect(selectedChip()).toHaveTextContent("3 selected");
	});

	it("selects by current quality across lines and reports looms not shown", async () => {
		renderGrid();
		await pickOption("With quality…", /SACKING_R/);
		// Looms 1, 2 (line 1) and 4 (line 2) carry quality 10.
		expect(selectedChip()).toHaveTextContent("3 selected (1 not shown)");
	});

	it("offers only groupings that contain looms of this grid, and selects their looms", async () => {
		renderGrid();
		await waitFor(() => expect(screen.getByPlaceholderText("In group…")).toBeInTheDocument());
		const input = screen.getByPlaceholderText("In group…");
		fireEvent.mouseDown(input);
		fireEvent.keyDown(input, { key: "ArrowDown" });
		const listbox = await screen.findByRole("listbox");
		expect(within(listbox).queryByText(/CRD/)).not.toBeInTheDocument();
		fireEvent.click(within(listbox).getByRole("option", { name: /WVR-01/ }));
		expect(selectedChip()).toHaveTextContent("2 selected (1 not shown)");
	});

	it("applies one quality to every selected loom and Save Map sends them all", async () => {
		renderGrid();
		await pickOption("With quality…", /SACKING_R/); // looms 1, 2, 4
		await pickOption("Set quality…", /PACKSHEET/);
		fireEvent.click(screen.getByRole("button", { name: "Apply to 3" }));
		expect(screen.getByRole("button", { name: /Save Map \(3 unsaved\)/ })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Save Map/ }));
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("quality_map_save"), "POST", expect.anything())
		);
		const saveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("quality_map_save"));
		const entries = (saveCall?.[2] as { entries: { machine_id: number; weaving_quality_id: number }[] }).entries;
		const byLoom = Object.fromEntries(entries.map((e) => [e.machine_id, e.weaving_quality_id]));
		expect(byLoom).toEqual({ 1: 20, 2: 20, 3: 20, 4: 20, 5: 20 });
	});

	it("opens the Fill from previous dialog with the grid date", () => {
		renderGrid();
		fireEvent.click(screen.getByRole("button", { name: /Fill from previous/ }));
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Fill from previous mapping")).toBeInTheDocument();
		expect(within(dialog).getByLabelText("From")).toHaveValue("2026-10-08");
		expect(within(dialog).getByRole("button", { name: /^Fill/ })).toBeDisabled(); // preview first
	});
});
