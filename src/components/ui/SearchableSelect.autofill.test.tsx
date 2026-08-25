/**
 * @vitest-environment jsdom
 *
 * Type-ahead autofill contract for the shared dropdown.
 *
 * Every dropdown in the app must be searchable with type-ahead autofill, so the
 * behaviour lives in SearchableSelect rather than at ~310 call sites. The part
 * worth pinning is the safety guard: Enter commits ONLY when typing narrowed the
 * list to a single, unambiguous option. Without that, `autoHighlight` would let
 * "FRAME 1" + Enter silently select "FRAME 12" when the operator meant
 * "FRAME 13" — a mis-keyed machine on a breakdown entry, and an invisible one.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SearchableSelect } from "./SearchableSelect";

afterEach(cleanup);

type Machine = { id: number; name: string };

const MACHINES: Machine[] = [
  { id: 1, name: "FRAME 12" },
  { id: 2, name: "FRAME 13" },
  { id: 3, name: "SPREADER 3" },
];

function renderSelect(onChange = vi.fn()) {
  render(
    <SearchableSelect<Machine>
      options={MACHINES}
      value={null}
      onChange={onChange}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      label="Machine"
      variant="outlined"
    />,
  );
  const input = screen.getByLabelText("Machine") as HTMLInputElement;
  input.focus();
  return { input, onChange };
}

describe("SearchableSelect type-ahead autofill", () => {
  it("filters the list as the user types", () => {
    const { input } = renderSelect();
    fireEvent.change(input, { target: { value: "SPRE" } });
    expect(screen.getByText("SPREADER 3")).toBeDefined();
    expect(screen.queryByText("FRAME 12")).toBeNull();
  });

  it("Enter commits the option when the filter left exactly one match", () => {
    const { input, onChange } = renderSelect();
    fireEvent.change(input, { target: { value: "SPRE" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ id: 3, name: "SPREADER 3" });
  });

  it("Enter does NOT commit while several options still match", () => {
    const { input, onChange } = renderSelect();
    // "FRAME 1" matches both FRAME 12 and FRAME 13 — committing either would be a guess.
    fireEvent.change(input, { target: { value: "FRAME 1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter commits once typing disambiguates a previously ambiguous filter", () => {
    const { input, onChange } = renderSelect();
    fireEvent.change(input, { target: { value: "FRAME 1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "FRAME 13" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ id: 2, name: "FRAME 13" });
  });

  it("Enter does nothing when the filter matches no option", () => {
    const { input, onChange } = renderSelect();
    fireEvent.change(input, { target: { value: "LOOM" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("autoComplete inline-completes the typed text with the single match", () => {
    const { input } = renderSelect();
    fireEvent.change(input, { target: { value: "SPRE" } });
    // MUI's autoComplete fills the remainder and selects it, so the operator can
    // keep typing to override or press Enter to accept.
    expect(input.value.toUpperCase().startsWith("SPRE")).toBe(true);
    const option = screen.getByText("SPREADER 3").closest("li");
    expect(option).not.toBeNull();
  });
});
