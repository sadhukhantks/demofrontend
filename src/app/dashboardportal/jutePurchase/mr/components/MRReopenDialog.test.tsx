/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MRReopenDialog } from "./MRReopenDialog";

afterEach(cleanup);

describe("MRReopenDialog", () => {
	it("offers both targets for a Pending / Approved MR and confirms the chosen one", () => {
		const onConfirm = vi.fn();
		render(<MRReopenDialog open loading={false} onClose={() => {}} onConfirm={onConfirm} />);
		expect(screen.getByText("Reopen Material Receipt")).toBeInTheDocument();
		expect(screen.getByLabelText("Reopen for MR edit")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText(/Reopen for QC/));
		fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
		expect(onConfirm).toHaveBeenCalledWith("qc");
	});

	it("on an Open MR offers only the QC rollback (TKT-000229)", () => {
		const onConfirm = vi.fn();
		render(<MRReopenDialog open loading={false} qcOnly onClose={() => {}} onConfirm={onConfirm} />);
		expect(screen.getByText("Roll back to Quality Check")).toBeInTheDocument();
		expect(screen.queryByLabelText("Reopen for MR edit")).not.toBeInTheDocument();
		expect(screen.getByText(/The MR stays Open/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Roll back to QC" }));
		expect(onConfirm).toHaveBeenCalledWith("qc");
	});
});
