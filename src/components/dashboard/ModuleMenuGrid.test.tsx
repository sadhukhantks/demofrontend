import { render, screen } from '@testing-library/react';
import {
  BarChart3, Boxes, ClipboardList, Factory, FileText, Receipt, Settings2, Wrench,
} from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuItem } from '@/components/dashboard/sidebarContext';
import { ModuleMenuGrid, resolveIcon } from './ModuleMenuGrid';

const menus: MenuItem[] = [
  { menu_id: 1, menu_name: 'Jute Production', menu_path: 'juteProduction', menu_parent_id: null },
  { menu_id: 2, menu_name: 'Spreader', menu_path: 'juteProduction/spreader', menu_parent_id: 1 },
  { menu_id: 3, menu_name: 'Masters', menu_path: 'juteProduction/masters', menu_parent_id: 1 },
  { menu_id: 4, menu_name: 'Bins', menu_path: 'juteProduction/masters/bins', menu_parent_id: 3 },
  { menu_id: 5, menu_name: 'Sales', menu_path: 'sales', menu_parent_id: null },
  { menu_id: 6, menu_name: 'Sales Order', menu_path: 'sales/order', menu_parent_id: 5 },
  { menu_id: 7, menu_name: 'Empty Module', menu_path: 'empty', menu_parent_id: null },
];

const mockMenus = vi.fn<() => MenuItem[]>(() => menus);
vi.mock('@/components/dashboard/sidebarContext', () => ({
  useSidebarContext: () => {
    const availableMenus = mockMenus();
    return { availableMenus, parentMenus: availableMenus.filter((m) => m.menu_parent_id === null) };
  },
}));

describe('ModuleMenuGrid', () => {
  // the `mounted` gate forces a second render, so mockReturnValueOnce would leak the default back in
  beforeEach(() => mockMenus.mockReturnValue(menus));

  it('renders every module, flattens nested leaves, and skips leafless modules', () => {
    render(<ModuleMenuGrid />);

    expect(screen.getByText('Jute Production')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    // "Masters" is an intermediate group, not a card title, and "Empty Module" has no leaves
    expect(screen.queryByText('Empty Module')).not.toBeInTheDocument();
    // nested leaf is flattened into the module grid, captioned with its intermediate parent
    expect(screen.getByText('Bins')).toBeInTheDocument();
    expect(screen.getByText('Masters')).toBeInTheDocument();
    // href is prefixed, case preserved
    expect(screen.getByText('Spreader').closest('a')).toHaveAttribute(
      'href',
      '/dashboardportal/juteProduction/spreader'
    );
  });

  it('scopes to one module by path, case-insensitively', () => {
    render(<ModuleMenuGrid modulePath="/dashboardportal/juteproduction" />);

    expect(screen.getByText('Spreader')).toBeInTheDocument();
    expect(screen.queryByText('Sales Order')).not.toBeInTheDocument();
  });

  it('falls back to the module owning a matching descendant leaf when no parent path matches', () => {
    mockMenus.mockReturnValue(menus.map((m) => (m.menu_id === 1 ? { ...m, menu_path: '' } : m)));
    render(<ModuleMenuGrid modulePath="/dashboardportal/juteProduction" />);

    expect(screen.getByText('Spreader')).toBeInTheDocument();
    expect(screen.queryByText('Sales Order')).not.toBeInTheDocument();
  });

  it('shows an empty state with no menus', () => {
    mockMenus.mockReturnValue([]);
    render(<ModuleMenuGrid />);

    expect(screen.getByText('No menus available for your role')).toBeInTheDocument();
  });
});

// Rule ORDER is the only non-trivial logic here and the only thing that rots silently.
describe('resolveIcon', () => {
  it.each([
    // rule 1 (master) wins over rule 10 (machine) and rule 11 (moisture)
    ['Machine Master', 'juteproduction', Settings2],
    ['Std Moisture Master', 'jutesqc', Settings2],
    ['Waste Rate Master', 'juteproduction', Settings2], // beats rule 4 (rate) and rule 8 (waste)
    // rule 2 (report) wins over the domain rules below it
    ['Winding Low Producer', 'juteproduction', BarChart3],
    ['Jute Stock Report', 'jutepurchase', BarChart3], // beats rule 8 (stock)
    // rule 3 (register) precedes rule 4 (pay) — a register is a list first
    ['Pay Register', 'hrms', ClipboardList],
    ['Bin Master', 'juteproduction', Settings2],
    ['Winding Production', 'juteproduction', Factory], // no earlier rule hits
    ['Loom Breakdown', 'jutemechanical', Wrench],
    ['Item Stock', 'inventory', Boxes],
  ])('%s -> expected icon', (name, key, icon) => {
    expect(resolveIcon(name, key)).toBe(icon);
  });

  it('falls back to the module glyph, then FileText for an unknown module', () => {
    expect(resolveIcon('Zyx', 'sales')).toBe(Receipt);
    expect(resolveIcon('Zyx', 'somenewmodule')).toBe(FileText);
  });
});
