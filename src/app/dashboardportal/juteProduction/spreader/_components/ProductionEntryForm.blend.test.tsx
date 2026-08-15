/**
 * @vitest-environment jsdom
 *
 * Dual-quality rolls: the entry payload carries item_id_2/ratio_1/ratio_2 only
 * when a second quality is on, and a locked blend freezes every blend field.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ProductionEntryForm from "./ProductionEntryForm";
import type { BinState, SpreaderSetup } from "../types/spreaderTypes";

const fetchWithCookie = vi.fn(async (..._args: unknown[]) => ({
	data: { data: { spreader_prod_entry_id: 1, entry_id_grp: 1 } },
	error: null,
}));
vi.mock("@/utils/apiClient2", () => ({
	fetchWithCookie: (...args: unknown[]) => fetchWithCookie(...args),
}));

let binState: BinState | null = null;
const refreshBinState = vi.fn();
vi.mock("../hooks/useBinState", () => ({
	useBinState: () => ({ state: binState, loading: false, error: null, refresh: refreshBinState }),
}));

const item = (id: number, name: string) => ({
	item_id: id,
	item_code: name,
	item_name: name,
	item_grp_id: 1,
	item_grp_name: "JUTE",
	item_type_id: 2,
});

const setup: SpreaderSetup = {
	machines: [{ machine_id: 5, machine_name: "SPREADER 1", mech_code: "S1", dept_id: 1, wt_per_roll: 40 }],
	bins: [{ bin_id: 3, bin_code: "BIN-3" }],
	items: [item(11, "JTD5"), item(22, "ATD5")],
	maturity_map: {},
	// All buckets spellFromHour() can return, so the wall-clock default is in range.
	spells: ["A1", "B1", "A2", "B2", "C"].map((c) => ({ code: c, label: c })),
};

function pick(comboName: string, optionName: string) {
	fireEvent.mouseDown(screen.getByRole("combobox", { name: comboName }));
	fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function renderForm() {
	render(<ProductionEntryForm coId="1" branchId={2} setup={setup} onSaved={() => {}} />);
	pick("Spreader", "SPREADER 1 (S1) — 40 kg");
	pick("Bin", "BIN-3");
	pick("Item (jute / jute waste)", "JTD5");
	fireEvent.change(screen.getByLabelText("No. of Rolls"), { target: { value: "5" } });
}

beforeEach(() => {
	binState = null;
	fetchWithCookie.mockClear();
	refreshBinState.mockClear();
});
afterEach(cleanup);

describe("ProductionEntryForm second quality", () => {
	it("sends a null second quality when the toggle is off", async () => {
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: /Save Entry/ }));
		await waitFor(() => expect(fetchWithCookie).toHaveBeenCalled());
		const body = fetchWithCookie.mock.calls[0][2] as Record<string, unknown>;
		expect(body).toMatchObject({ item_id: 11, item_id_2: null, ratio_1: 1, ratio_2: null });
	});

	it("sends both qualities and the ratio when the toggle is on", async () => {
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: /Second quality/ }));
		pick("Second quality", "ATD5");
		fireEvent.change(screen.getByLabelText("Ratio 1"), { target: { value: "2" } });
		fireEvent.change(screen.getByLabelText("Ratio 2"), { target: { value: "1" } });
		fireEvent.click(screen.getByRole("button", { name: /Save Entry/ }));
		await waitFor(() => expect(fetchWithCookie).toHaveBeenCalled());
		const body = fetchWithCookie.mock.calls[0][2] as Record<string, unknown>;
		expect(body).toMatchObject({ item_id: 11, item_id_2: 22, ratio_1: 2, ratio_2: 1 });
		// The blend is sticky across saves by design (it mirrors item_id): the form
		// never clears it, so the next entry keeps feeding the group just opened. The
		// save does re-read the bin state, and the lock effect overwrites the blend
		// once that refreshed state arrives.
		await waitFor(() => expect(refreshBinState).toHaveBeenCalled());
		expect(screen.getByRole("combobox", { name: "Second quality" })).toHaveTextContent("ATD5");
		expect(screen.getByLabelText("Ratio 1")).toHaveValue(2);
		expect(screen.getByLabelText("Ratio 2")).toHaveValue(1);
	});

	it("blocks saving on a fractional ratio", async () => {
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: /Second quality/ }));
		pick("Second quality", "ATD5");
		fireEvent.change(screen.getByLabelText("Ratio 1"), { target: { value: "1.5" } });
		expect(screen.getByRole("button", { name: /Save Entry/ })).toBeDisabled();
	});

	it("freezes every blend field when the bin is locked to a blend", () => {
		binState = {
			active_grp: 9,
			locked_item_id: 11,
			locked_item_id_2: 22,
			locked_ratio_1: 2,
			locked_ratio_2: 1,
			locked_quality_label: "JTD5/ATD5 (2:1)",
			window: null,
		};
		// No pick(): every blend field is disabled, the effect fills them from the lock.
		render(<ProductionEntryForm coId="1" branchId={2} setup={setup} onSaved={() => {}} />);
		expect(screen.getByText("Open group locked to quality: JTD5/ATD5 (2:1)")).toBeInTheDocument();
		expect(screen.getByLabelText("Ratio 1")).toBeDisabled();
		expect(screen.getByLabelText("Ratio 2")).toBeDisabled();
		expect(screen.getByRole("combobox", { name: "Second quality" })).toHaveAttribute("aria-disabled", "true");
		expect(screen.queryByRole("button", { name: "✕" })).toBeNull();
	});
});
