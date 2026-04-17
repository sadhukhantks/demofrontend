import React from "react";
import { useLineItems } from "@/components/ui/transaction";
import type { MuiFormMode } from "@/components/ui/muiform";
import { toast } from "@/hooks/use-toast";
import type { InvoiceLine, DeliveryOrderLineForInvoice, SalesOrderLineForInvoice } from "@/utils/salesInvoiceService";
import type { EditableLineItem, ItemGroupCacheEntry, ItemGroupRecord } from "../types/salesInvoiceTypes";
import { createBlankLine, generateLineId } from "../utils/salesInvoiceFactories";
import { calculateLineAmount, calculateLineTax } from "../utils/salesInvoiceCalculations";
import { DISCOUNT_TYPE } from "../utils/salesInvoiceConstants";

export const lineHasAnyData = (line: EditableLineItem) =>
	Boolean(line.itemGroup || line.item || line.itemMake || line.quantity || line.rate || line.uom || line.remarks);

export const lineIsComplete = (line: EditableLineItem) => {
	const qty = Number(line.quantity);
	return Boolean(line.itemGroup && line.item && line.uom && Number.isFinite(qty) && qty > 0);
};

type Params = {
	mode: MuiFormMode;
	partyState?: string;
	shippingState?: string;
	itemGroupCache: Partial<Record<string, ItemGroupCacheEntry>>;
	itemGroupLoading: Partial<Record<string, boolean>>;
	ensureItemGroupData: (groupId: string) => void;
	itemGroups: ReadonlyArray<ItemGroupRecord>;
	invoiceTypeId?: string;
};

export const useSalesInvoiceLineItems = ({
	mode, partyState, shippingState,
	itemGroupCache, itemGroupLoading, ensureItemGroupData, itemGroups, invoiceTypeId,
}: Params) => {
	const isHessian = invoiceTypeId === "2";
	const isGovtSkg = invoiceTypeId === "3";
	const {
		items: lineItems, setItems: setLineItems, replaceItems, removeItems: removeLineItems,
	} = useLineItems<EditableLineItem>({
		createBlankItem: createBlankLine,
		hasData: lineHasAnyData,
		getItemId: (item) => item.id,
		maintainTrailingBlank: mode !== "view",
	});

	const doGroupInfoRef = React.useRef<Map<string, { code?: string; name?: string }>>(new Map());
	const soGroupInfoRef = React.useRef<Map<string, { code?: string; name?: string }>>(new Map());

	/**
	 * Look up the bales conversion for a govt sacking item.
	 * Finds the UOM mapping where mapToName contains "bale" (case-insensitive),
	 * returns { factor, balesUomId } or undefined.
	 * If a known balesUomId is provided, uses that for an exact match first.
	 */
	const getGovtSkgBalesConversion = React.useCallback(
		(groupId: string, itemId: string, billingUomId: string, knownBalesUomId?: string): { factor: number; balesUomId: string } | undefined => {
			const cache = itemGroupCache[groupId];
			if (!cache) return undefined;
			const conversions = cache.uomConversionsByItemId[itemId];
			if (!conversions?.length) return undefined;
			if (knownBalesUomId) {
				for (const conv of conversions) {
					if (conv.mapFromId === billingUomId && conv.mapToId === knownBalesUomId && conv.relationValue > 0) {
						return { factor: conv.relationValue, balesUomId: conv.mapToId };
					}
				}
			}
			for (const conv of conversions) {
				if (conv.mapFromId === billingUomId && conv.relationValue > 0 && conv.mapToName.toLowerCase().includes("bale")) {
					return { factor: conv.relationValue, balesUomId: conv.mapToId };
				}
			}
			return undefined;
		},
		[itemGroupCache],
	);

	const mapLineToEditable = React.useCallback((line: InvoiceLine): EditableLineItem => ({
		id: line.id ? String(line.id) : generateLineId(),
		deliveryOrderDtlId: line.deliveryOrderDtlId,
		salesOrderDtlId: line.salesOrderDtlId,
		hsnCode: line.hsnCode,
		itemGroup: line.itemGroup ? String(line.itemGroup) : "",
		item: line.item ?? "",
		itemCode: line.itemCode,
		itemName: line.itemName,
		fullItemCode: line.fullItemCode ?? line.itemCode,
		itemMake: line.itemMake ?? "",
		quantity: line.quantity != null ? String(line.quantity) : "",
		rate: line.rate != null ? String(line.rate) : "",
		uom: line.uom ?? "",
		discountType: line.discountType,
		discountedRate: line.discountedRate,
		discountAmount: line.discountAmount,
		netAmount: line.netAmount,
		totalAmount: line.totalAmount,
		remarks: line.remarks ?? "",
		taxPercentage: line.gst?.taxPercentage ?? line.taxPercentage,
		igstAmount: line.gst?.igstAmount,
		igstPercent: line.gst?.igstPercent,
		cgstAmount: line.gst?.cgstAmount,
		cgstPercent: line.gst?.cgstPercent,
		sgstAmount: line.gst?.sgstAmount,
		sgstPercent: line.gst?.sgstPercent,
		gstTotal: line.gst?.taxAmount ?? line.gst?.gstTotal,
		juteClaimAmountDtl: line.juteDtl?.claimAmountDtl,
		juteClaimDesc: line.juteDtl?.claimDesc ?? "",
		juteClaimRate: line.juteDtl?.claimRate,
		juteUnitConversion: line.juteDtl?.unitConversion ?? "",
		juteQtyUnitConversion: line.juteDtl?.qtyUnitConversion,
		hessianQtyBales: line.hessianDtl?.qtyBales,
		hessianRatePerBale: line.hessianDtl?.ratePerBale,
		hessianBillingRateMt: line.hessianDtl?.billingRateMt,
		hessianBillingRateBale: line.hessianDtl?.billingRateBale,
		govtskgPackSheet: line.govtskgDtl?.packSheet,
		govtskgNetWeight: line.govtskgDtl?.netWeight,
		govtskgTotalWeight: line.govtskgDtl?.totalWeight,
	}), []);

	const recalcLine = React.useCallback((item: EditableLineItem): EditableLineItem => {
		const qty = Number(item.quantity) || 0;
		const rate = Number(item.rate) || 0;
		const discountValue = item.discountType === DISCOUNT_TYPE.PERCENTAGE
			? (item.discountedRate != null && rate > 0 ? ((rate - (item.discountedRate || rate)) / rate) * 100 : 0)
			: (item.discountAmount != null && qty > 0 ? (item.discountAmount || 0) / qty : 0);
		const { netAmount, discountAmount, discountedRate } = calculateLineAmount(qty, rate, item.discountType, discountValue);
		const tax = calculateLineTax(netAmount, item.taxPercentage || 0, partyState, shippingState);
		return {
			...item,
			discountAmount, discountedRate, netAmount,
			totalAmount: netAmount + tax.gstTotal,
			...tax,
		};
	}, [partyState, shippingState]);

	const handleLineFieldChange = React.useCallback(
		(id: string, field: keyof EditableLineItem, rawValue: string | number) => {
			if (mode === "view") return;
			const value = typeof rawValue === "number" ? String(rawValue) : rawValue;

			if (field === "itemGroup") {
				setLineItems((prev) =>
					prev.map((item) =>
						item.id === id ? { ...item, itemGroup: value, item: "", itemMake: "", uom: "", rate: "", hsnCode: "" } : item,
					),
				);
				if (value && !itemGroupCache[value] && !itemGroupLoading[value]) void ensureItemGroupData(value);
				return;
			}

			if (field === "item") {
				setLineItems((prev) => {
					const isDuplicate = prev.some((line) => line.id !== id && line.item === value && lineHasAnyData(line));
					if (isDuplicate && value) {
						toast({ variant: "destructive", title: "Duplicate item", description: "This item is already added." });
						return prev;
					}
					return prev.map((item) => {
						if (item.id !== id) return item;
						const cache = itemGroupCache[item.itemGroup ?? ""];
						const defaultRate = cache?.itemRateById[value];
						const defaultTax = cache?.itemTaxById[value];
						const defaultUom = cache?.items.find((opt) => opt.value === value)?.defaultUomId;
						const uomOptions = cache?.uomsByItemId[value] ?? [];
						let nextUom = item.uom;
						if (defaultUom && uomOptions.some((opt) => opt.value === defaultUom)) nextUom = defaultUom;
						else if (uomOptions.length) nextUom = uomOptions[0].value;
						const effectiveRate = isHessian && defaultRate != null ? Math.round(defaultRate) : defaultRate;
						const updated: EditableLineItem = {
							...item, item: value, uom: nextUom,
							rate: effectiveRate != null ? String(effectiveRate) : item.rate,
							taxPercentage: defaultTax,
						};
						return recalcLine(updated);
					});
				});
				return;
			}

			// --- Govt SKG: user enters bales; auto-calc quantity (per-100-pcs) ---
			if (isGovtSkg && field === "govtskgQtyBales") {
				const sanitized = value.replace(/[^0-9.]/g, "");
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;
						let convFactor = item.govtskgConversionFactor || 0;
						let balesUomId = item.govtskgBalesUomId;
						if (!convFactor && item.itemGroup && item.item && item.uom) {
							const balesConv = getGovtSkgBalesConversion(item.itemGroup, item.item, item.uom, balesUomId);
							convFactor = balesConv?.factor || 0;
							balesUomId = balesConv?.balesUomId || balesUomId;
						}
						const bales = Number(sanitized) || 0;
						const quantity = convFactor > 0 ? bales / convFactor : 0;
						return recalcLine({
							...item,
							govtskgConversionFactor: convFactor || item.govtskgConversionFactor,
							govtskgBalesUomId: balesUomId,
							govtskgQtyBales: sanitized,
							quantity: bales > 0 && convFactor > 0 ? String(quantity) : "",
						});
					}),
				);
				return;
			}

			// --- Govt SKG rate change: if bales entered, recompute quantity too ---
			if (isGovtSkg && field === "rate") {
				const sanitized = value.replace(/[^0-9.]/g, "");
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;
						let convFactor = item.govtskgConversionFactor || 0;
						let balesUomId = item.govtskgBalesUomId;
						if (!convFactor && item.itemGroup && item.item && item.uom) {
							const balesConv = getGovtSkgBalesConversion(item.itemGroup, item.item, item.uom, balesUomId);
							convFactor = balesConv?.factor || 0;
							balesUomId = balesConv?.balesUomId || balesUomId;
						}
						const bales = Number(item.govtskgQtyBales) || 0;
						const quantity = bales > 0 && convFactor > 0 ? bales / convFactor : Number(item.quantity) || 0;
						return recalcLine({
							...item,
							rate: sanitized,
							govtskgConversionFactor: convFactor || item.govtskgConversionFactor,
							govtskgBalesUomId: balesUomId,
							quantity: bales > 0 && convFactor > 0 ? String(quantity) : item.quantity,
						});
					}),
				);
				return;
			}

			if (field === "quantity" || field === "rate") {
				const sanitized = value.replace(/[^0-9.]/g, "");
				const applied = isHessian && field === "rate"
					? String(Math.round(Number(sanitized) || 0))
					: sanitized;
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;
						return recalcLine({ ...item, [field]: applied });
					}),
				);
				return;
			}

			if (field === "discountType") {
				const modeValue = value ? Number(value) : undefined;
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;
						return recalcLine({ ...item, discountType: modeValue, discountedRate: undefined, discountAmount: undefined });
					}),
				);
				return;
			}

			if (field === "discountedRate") {
				const sanitized = value.replace(/[^0-9.]/g, "");
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;
						const rate = Number(item.rate) || 0;
						const discountedRate = Number(sanitized) || 0;
						if (discountedRate > rate && rate > 0) {
							toast({ variant: "destructive", title: "Invalid", description: "Discounted rate must be less than rate." });
							return item;
						}
						const qty = Number(item.quantity) || 0;
						const netAmount = qty * discountedRate;
						const discountAmount = (rate - discountedRate) * qty;
						const tax = calculateLineTax(netAmount, item.taxPercentage || 0, partyState, shippingState);
						return {
							...item, discountedRate, discountAmount, netAmount,
							totalAmount: netAmount + tax.gstTotal, ...tax,
						};
					}),
				);
				return;
			}

			setLineItems((prev) =>
				prev.map((item) => (item.id === id ? { ...item, [field]: value } as EditableLineItem : item)),
			);
		},
		[mode, setLineItems, itemGroupCache, itemGroupLoading, ensureItemGroupData, recalcLine, isHessian, isGovtSkg, getGovtSkgBalesConversion, partyState, shippingState],
	);

	const replaceWithDeliveryOrderLines = React.useCallback(
		(items: DeliveryOrderLineForInvoice[]) => {
			const uniqueGroupIds = Array.from(new Set(items.map((item) => String(item.item_grp_id))));
			uniqueGroupIds.forEach((groupId) => {
				if (groupId && !itemGroupCache[groupId]) ensureItemGroupData(groupId);
			});

			const newLines: EditableLineItem[] = items.map((item) => {
				const qty = item.quantity || 0;
				const rate = item.rate || 0;
				const netAmt = item.net_amount ?? qty * rate;
				const tax = calculateLineTax(netAmt, item.tax_percentage || 0, partyState, shippingState);
				return {
					id: generateLineId(),
					deliveryOrderDtlId: item.delivery_order_dtl_id,
					hsnCode: item.hsn_code || "",
					itemGroup: String(item.item_grp_id),
					item: String(item.item_id),
					itemCode: item.item_code,
					itemName: item.item_name,
					fullItemCode: item.full_item_code,
					itemMake: item.item_make_id ? String(item.item_make_id) : "",
					quantity: String(qty),
					rate: String(rate),
					uom: String(item.uom_id),
					discountType: item.discount_type,
					discountedRate: item.discounted_rate,
					discountAmount: item.discount_amount,
					netAmount: netAmt,
					totalAmount: (netAmt) + tax.gstTotal,
					remarks: item.remarks || "",
					taxPercentage: item.tax_percentage,
					...tax,
					govtskgPackSheet: item.govtskg_pack_sheet != null ? Number(item.govtskg_pack_sheet) : undefined,
					govtskgNetWeight: item.govtskg_net_weight != null ? Number(item.govtskg_net_weight) : undefined,
					govtskgTotalWeight: item.govtskg_total_weight != null ? Number(item.govtskg_total_weight) : undefined,
				};
			});

			items.forEach((item) => {
				const groupId = String(item.item_grp_id);
				if (!doGroupInfoRef.current.has(groupId)) {
					doGroupInfoRef.current.set(groupId, { code: item.item_grp_code, name: item.item_grp_name });
				}
			});

			replaceItems(newLines);
		},
		[ensureItemGroupData, itemGroupCache, replaceItems, partyState, shippingState],
	);

	const replaceWithSalesOrderLines = React.useCallback(
		(items: SalesOrderLineForInvoice[]) => {
			const uniqueGroupIds = Array.from(new Set(items.map((item) => String(item.item_grp_id))));
			uniqueGroupIds.forEach((groupId) => {
				if (groupId && !itemGroupCache[groupId]) ensureItemGroupData(groupId);
			});

			const newLines: EditableLineItem[] = items.map((item) => {
				const qty = item.quantity || 0;
				const rate = item.rate || 0;
				const netAmt = item.net_amount ?? qty * rate;
				const tax = calculateLineTax(netAmt, item.tax_percentage || 0, partyState, shippingState);
				return {
					id: generateLineId(),
					salesOrderDtlId: item.sales_order_dtl_id,
					hsnCode: item.hsn_code || "",
					itemGroup: String(item.item_grp_id),
					item: String(item.item_id),
					itemCode: item.item_code,
					itemName: item.item_name,
					fullItemCode: item.full_item_code,
					itemMake: item.item_make_id ? String(item.item_make_id) : "",
					quantity: String(qty),
					rate: String(rate),
					uom: String(item.uom_id),
					discountType: item.discount_type,
					discountedRate: item.discounted_rate,
					discountAmount: item.discount_amount,
					netAmount: netAmt,
					totalAmount: netAmt + tax.gstTotal,
					remarks: item.remarks || "",
					taxPercentage: item.tax_percentage,
					...tax,
				};
			});

			items.forEach((item) => {
				const groupId = String(item.item_grp_id);
				if (!soGroupInfoRef.current.has(groupId)) {
					soGroupInfoRef.current.set(groupId, { code: item.item_grp_code, name: item.item_grp_name });
				}
			});

			replaceItems(newLines);
		},
		[ensureItemGroupData, itemGroupCache, replaceItems, partyState, shippingState],
	);

	const clearImportedLines = React.useCallback(() => {
		replaceItems([]);
	}, [replaceItems]);

	// --- Govt SKG: back-fill bales once UOM cache loads ---
	// Items loaded from saved invoice or from DO/SO import don't have govtskgQtyBales
	// until the setup_2 API returns conversion data. This patches lines once cache is available.
	React.useEffect(() => {
		if (!isGovtSkg) return;
		setLineItems((prev) => {
			let changed = false;
			const next = prev.map((line) => {
				const needsFactor = !line.govtskgConversionFactor;
				const needsBalesBackfill = !line.govtskgQtyBales && Number(line.quantity) > 0;
				if ((needsFactor || needsBalesBackfill) && line.itemGroup && line.item && line.uom) {
					const balesConv = getGovtSkgBalesConversion(line.itemGroup, line.item, line.uom, line.govtskgBalesUomId);
					if (balesConv) {
						changed = true;
						let bales = Number(line.govtskgQtyBales) || 0;
						if (bales === 0 && Number(line.quantity) > 0) {
							bales = Number(line.quantity) * balesConv.factor;
						}
						return {
							...line,
							govtskgConversionFactor: balesConv.factor,
							govtskgBalesUomId: balesConv.balesUomId,
							govtskgQtyBales: bales > 0 ? String(bales) : line.govtskgQtyBales,
						};
					}
				}
				return line;
			});
			return changed ? next : prev;
		});
	}, [isGovtSkg, itemGroupCache, setLineItems, getGovtSkgBalesConversion]);

	const filledLineItems = React.useMemo(() => lineItems.filter(lineHasAnyData), [lineItems]);

	const lineItemsValid = React.useMemo(() => {
		if (mode === "view") return true;
		if (!filledLineItems.length) return false;
		return filledLineItems.every(lineIsComplete);
	}, [filledLineItems, mode]);

	const itemGroupsFromLineItems: ItemGroupRecord[] = React.useMemo(() => {
		const groups = new Map<string, { id: string; label: string }>();
		itemGroups.forEach((grp) => groups.set(grp.id, grp));
		lineItems.forEach((line) => {
			if (line.itemGroup && !groups.has(line.itemGroup)) {
				const cachedLabel = itemGroupCache[line.itemGroup]?.groupLabel;
				if (cachedLabel) {
					groups.set(line.itemGroup, { id: line.itemGroup, label: cachedLabel });
				} else {
					const doInfo = doGroupInfoRef.current.get(line.itemGroup);
					const soInfo = soGroupInfoRef.current.get(line.itemGroup);
					const info = doInfo ?? soInfo;
					const labelParts = info ? [info.code, info.name].filter(Boolean) : [];
					const label = labelParts.length ? labelParts.join(" — ") : line.itemGroup;
					groups.set(line.itemGroup, { id: line.itemGroup, label });
				}
			}
		});
		return Array.from(groups.values());
	}, [itemGroupCache, itemGroups, lineItems]);

	return {
		lineItems, setLineItems, replaceItems, removeLineItems,
		handleLineFieldChange, replaceWithDeliveryOrderLines, replaceWithSalesOrderLines,
		clearImportedLines,
		mapLineToEditable, filledLineItems, lineItemsValid, itemGroupsFromLineItems,
		lineHasAnyData,
	};
};
