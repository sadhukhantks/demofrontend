"use client";
import React, { useState, useEffect } from "react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";

// Generic menu item interface that can handle any field names
interface MenuItemGeneric {
  [key: string]: any;
}

// Field mapping interface to define property mappings
interface FieldMapping {
  idField: string;
  nameField: string;
  parentIdField: string;
  roleIdField?: string;
  accessLevelField?: string; // Add field for access level
}

// Default mapping that matches the original implementation
const DEFAULT_MAPPING: FieldMapping = {
  idField: "con_menu_id",
  nameField: "con_menu_name",
  parentIdField: "con_menu_parent_id",
  roleIdField: "con_role_id",
  accessLevelField: undefined // Default to undefined
};

// Dropdown option interface for child items
interface DropdownOption {
  value: string;
  label: string;
}

// Default dropdown options
const DEFAULT_OPTIONS: DropdownOption[] = [
  { value: "0", label: "Not Accessible" },
  { value: "1", label: "Read Only" },
  { value: "2", label: "Full Access" }
];

type Props = {
  menuData: MenuItemGeneric[];
  onSelectionChange: (selectedIds: number[], accessLevels?: Record<number, string>) => void;
  fieldMapping?: FieldMapping;
  dropdownOptions?: DropdownOption[];
};

const MenuTableDropdown: React.FC<Props> = ({
  menuData,
  onSelectionChange,
  fieldMapping = DEFAULT_MAPPING, // Use default mapping if not provided
  dropdownOptions = DEFAULT_OPTIONS // Use default options if not provided
}) => {
  const [expandedParents, setExpandedParents] = useState<number[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([]);
  const [accessLevels, setAccessLevels] = useState<Record<number, string>>({});

  // Extract field names from mapping
  const { idField, nameField, parentIdField, roleIdField, accessLevelField } = fieldMapping; // Destructure accessLevelField

  // Added ref to track initial load
  const initialLoadRef = React.useRef(true);

  useEffect(() => {
    // Skip effect after initial load to prevent overriding user selections
    if (!initialLoadRef.current) {
      return;
    }

    // Initialize selected menu IDs based on role ID field if it exists
    const initialSelectedIdsBasedOnRole = roleIdField
      ? menuData.filter(item => item[roleIdField] !== null).map(item => item[idField])
      : [];

    const initialAccessLevels: Record<number, string> = {};
    initialSelectedIdsBasedOnRole.forEach(id => {
      const menuItem = menuData.find(item => item[idField] === id);
      // Use accessLevelField if provided and exists on item, otherwise default to "1"
      const initialLevel = (accessLevelField && menuItem && menuItem[accessLevelField] !== null && menuItem[accessLevelField] !== undefined)
        ? String(menuItem[accessLevelField]) // Convert to string as dropdown values are strings
        : "1"; // Default to "Read Only"
      initialAccessLevels[id] = initialLevel; // Store the determined initial level
    });

    // Filter out IDs where the initial level resolved to "0" (Not Accessible)
    // These shouldn't be considered 'selected' in the checkbox logic
    const finalSelectedIds = initialSelectedIdsBasedOnRole.filter(id => initialAccessLevels[id] !== "0");

    setSelectedMenuIds(finalSelectedIds);
    setAccessLevels(initialAccessLevels); // Set the full map including potential "0"s for dropdown state
    // Pass the filtered IDs (truly selected) and the full initial levels map
    onSelectionChange(finalSelectedIds, initialAccessLevels);

    // Mark initial load as complete
    initialLoadRef.current = false;
  }, [menuData, roleIdField, idField, accessLevelField]); // Remove onSelectionChange from dependencies

  const toggleExpand = (parentId: number) => {
    setExpandedParents((prev) =>
      prev.includes(parentId) ? prev.filter((id) => id !== parentId) : [...prev, parentId]
    );
  };

  const validMenuData = Array.isArray(menuData) ? menuData : [];

  // menu_mst is a self-referencing tree of arbitrary depth (module -> page ->
  // report). Everything below walks it recursively so third-level entries
  // (reports) can be granted or denied per role like any other menu.
  const childrenOf = (id: number): MenuItemGeneric[] =>
    validMenuData.filter((item) => item[parentIdField] === id);

  const hasChildren = (id: number): boolean =>
    validMenuData.some((item) => item[parentIdField] === id);

  const descendantIds = (id: number): number[] =>
    childrenOf(id).flatMap((child) => [child[idField], ...descendantIds(child[idField])]);

  // Only the leaves carry a meaningful access level, so all/any checks use them.
  const leafDescendantIds = (id: number): number[] =>
    descendantIds(id).filter((descId) => !hasChildren(descId));

  const parentLookup = new Map<number, number | null>(
    validMenuData.map((item) => [item[idField], item[parentIdField]])
  );

  const ancestorIds = (id: number): number[] => {
    const out: number[] = [];
    let parent = parentLookup.get(id);
    while (parent !== null && parent !== undefined) {
      out.push(parent);
      parent = parentLookup.get(parent);
    }
    return out;
  };

  // Drop any ancestor of `id` that no longer has a selected leaf under it.
  const pruneAncestors = (id: number, ids: number[]): number[] => {
    let out = ids;
    ancestorIds(id).forEach((ancestorId) => {
      const stillSelected = leafDescendantIds(ancestorId).some((leafId) => out.includes(leafId));
      if (!stillSelected) {
        out = out.filter((selectedId) => selectedId !== ancestorId);
      }
    });
    return out;
  };

  const areAllChildrenSelected = (parentId: number): boolean => {
    const leafIds = leafDescendantIds(parentId);
    return leafIds.length > 0 && leafIds.every(id => selectedMenuIds.includes(id));
  };

  const isAnyChildSelected = (parentId: number): boolean => {
    const leafIds = leafDescendantIds(parentId);
    return leafIds.some(id => selectedMenuIds.includes(id));
  };

  const commit = (ids: number[], levels: Record<number, string>) => {
    setSelectedMenuIds(ids);
    setAccessLevels(levels);
    onSelectionChange(ids, levels);
  };

  // Checkbox on a branch row: select or clear the whole subtree.
  const handleParentCheckboxChange = (parentId: number, isChecked: boolean) => {
    const subtreeIds = descendantIds(parentId);
    const newAccessLevels = { ...accessLevels };
    let newSelectedIds: number[];

    if (isChecked) {
      // Add the branch, its ancestors and the whole subtree (avoid duplicates)
      newSelectedIds = [...new Set([
        ...selectedMenuIds,
        parentId,
        ...ancestorIds(parentId),
        ...subtreeIds,
      ])];

      // Set default access level for newly selected descendants
      subtreeIds.forEach(descId => {
        if (!accessLevels[descId]) {
          newAccessLevels[descId] = "1"; // Default to "Read Only"
        }
      });
    } else {
      // Remove the branch and its whole subtree from selection
      newSelectedIds = selectedMenuIds.filter(
        id => id !== parentId && !subtreeIds.includes(id)
      );

      // Remove access levels for deselected rows
      subtreeIds.forEach(descId => {
        delete newAccessLevels[descId];
      });
      delete newAccessLevels[parentId];

      newSelectedIds = pruneAncestors(parentId, newSelectedIds);
    }

    commit(newSelectedIds, newAccessLevels);
  };

  // Access dropdown on any non-root row. "0" (Not Accessible) removes the row;
  // on a branch it clears the subtree too, so children never outlive the parent.
  const handleChildAccessChange = (menuId: number, value: string) => {
    const newAccessLevels = { ...accessLevels };

    if (value === "0") {
      const subtreeIds = descendantIds(menuId);
      subtreeIds.forEach(descId => delete newAccessLevels[descId]);
      delete newAccessLevels[menuId];

      let finalIds = selectedMenuIds.filter(
        id => id !== menuId && !subtreeIds.includes(id)
      );
      finalIds = pruneAncestors(menuId, finalIds);

      commit(finalIds, newAccessLevels);
      return;
    }

    // Select the row and every ancestor so the path stays reachable
    const newSelectedIds = [...new Set([...selectedMenuIds, menuId, ...ancestorIds(menuId)])];
    newAccessLevels[menuId] = value;

    commit(newSelectedIds, newAccessLevels);
  };

  const rootMenus = validMenuData.filter((item) => item[parentIdField] === null);

  const renderRows = (item: MenuItemGeneric, depth: number): React.ReactNode => {
    const menuId = item[idField];
    const children = childrenOf(menuId);
    const isBranch = children.length > 0;
    const indent = { paddingLeft: `${16 + depth * 20}px` };

    const accessCell = depth > 0 ? (
      <SearchableOptionSelect
        fullWidth
        options={dropdownOptions.map((option) => ({ value: option.value, label: option.label }))}
        value={selectedMenuIds.includes(menuId) ? accessLevels[menuId] || "1" : "0"}
        onChange={(selectedValue) => handleChildAccessChange(menuId, String(selectedValue))}
        clearable={false}
      />
    ) : null;

    return (
      <React.Fragment key={menuId}>
        <tr className={depth === 0 ? "bg-white border-t" : "bg-gray-50 border-t"}>
          <td
            className={depth === 0 ? "px-4 py-2 font-medium" : "px-4 py-2 text-gray-700"}
            style={indent}
          >
            {isBranch ? (
              <button type="button" onClick={() => toggleExpand(menuId)}>
                {expandedParents.includes(menuId) ? "▼" : "►"} {item[nameField]}
              </button>
            ) : (
              <span>— {item[nameField]}</span>
            )}
          </td>
          <td className="px-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              {isBranch && (
                <input
                  type="checkbox"
                  title="Select or clear this menu and everything under it"
                  checked={areAllChildrenSelected(menuId)}
                  onChange={(e) => handleParentCheckboxChange(menuId, e.target.checked)}
                  // Indeterminate when some but not all descendants are selected
                  ref={el => {
                    if (el) {
                      el.indeterminate = !areAllChildrenSelected(menuId) && isAnyChildSelected(menuId);
                    }
                  }}
                />
              )}
              {accessCell}
            </div>
          </td>
        </tr>

        {isBranch && expandedParents.includes(menuId) &&
          children.map((child) => renderRows(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <table className="min-w-full border-blue text-sm">
      <thead className="border-blue">
        <tr>
          <th className="px-4 py-2 text-left">Menu Name</th>
          <th className="px-4 py-2 text-left">Access Level</th>
        </tr>
      </thead>
      <tbody>
        {rootMenus.map((root) => renderRows(root, 0))}
      </tbody>
    </table>
  );
};

export default MenuTableDropdown;
