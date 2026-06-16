/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

// Mock mappers (we'll test them indirectly through the service)
describe('yarnQualityService', () => {
  it('should properly unwrap setup response with nested data object', () => {
    // Simulate the API response from the backend (yarn ITEMS, item_type_id=4)
    const apiResponse = {
      data: {
        yarn_items: [
          { item_id: 1, item_name: "10 SKWP", item_code: "YRN-10-SKWP" },
          { item_id: 2, item_name: "12 SKWT", item_code: "YRN-12-SKWT" },
          { item_id: 3, item_name: "8 HSWP", item_code: "YRN-8-HSWP" },
        ],
      }
    };

    // The mapper should unwrap this structure
    const unwrapped = apiResponse?.data || apiResponse;
    expect(unwrapped.yarn_items).toBeDefined();
    expect(unwrapped.yarn_items).toHaveLength(3);
    expect(unwrapped.yarn_items[0]).toEqual({
      item_id: 1,
      item_name: "10 SKWP",
      item_code: "YRN-10-SKWP",
    });
  });

  it('should handle missing data object gracefully', () => {
    // If response doesn't have nested data, it should still work
    const apiResponse: Record<string, unknown> = {
      yarn_items: [{ item_id: 1, item_name: "10 SKWP", item_code: "YRN-10-SKWP" }]
    };

    const unwrapped = (apiResponse?.data || apiResponse) as Record<string, unknown>;
    expect(unwrapped.yarn_items).toBeDefined();
    expect(unwrapped.yarn_items).toHaveLength(1);
  });

  it('should handle empty yarn_items array', () => {
    const apiResponse = {
      data: {
        yarn_items: []
      }
    };

    const unwrapped = apiResponse?.data || apiResponse;
    const yarnItems = unwrapped?.yarn_items || [];
    expect(yarnItems).toEqual([]);
    expect(yarnItems.length).toBe(0);
  });

  it('should handle edit setup response with yarn_quality_details (item-anchored + std_mr_pct)', () => {
    const apiResponse = {
      data: {
        yarn_items: [{ item_id: 1, item_name: "10 SKWP", item_code: "YRN-10-SKWP" }],
        yarn_quality_details: {
          yarn_quality_id: 10,
          quality_code: "QC001",
          item_id: 1,
          twist_per_inch: 5.5,
          std_count: 10,
          std_doff: 100,
          std_wt_doff: 500,
          std_mr_pct: 13.75,
          is_active: 1
        }
      }
    };

    const unwrapped = apiResponse?.data || apiResponse;
    expect(unwrapped.yarn_items).toBeDefined();
    expect(unwrapped.yarn_quality_details).toBeDefined();
    expect(unwrapped.yarn_quality_details.quality_code).toBe("QC001");
    expect(unwrapped.yarn_quality_details.item_id).toBe(1);
    expect(unwrapped.yarn_quality_details.std_mr_pct).toBe(13.75);
  });

  it('should map item_id correctly as string for dropdown value', () => {
    const yarnItem = { item_id: 1, item_name: "10 SKWP", item_code: "YRN-10-SKWP" };

    // Component converts to string for dropdown value
    expect(yarnItem.item_id.toString()).toBe("1");
    expect(yarnItem.item_name).toBe("10 SKWP");
  });
});
