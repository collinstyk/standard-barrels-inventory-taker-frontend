import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "../api";
import { quantity } from "./checkout-model";

export type Availability = {
  previewedAt: string;
  warehouses: Array<{
    warehouseId: number;
    sellableQuantityBase: number;
    availableQuantityInRequestedUnit: number;
    sufficientForRequestedQuantity: boolean | null;
  }>;
};

export function StockPreview({
  userId,
  productId,
  unitId,
  warehouseId,
  ordered,
  unitName,
}: {
  userId: string;
  productId: string;
  unitId: number;
  warehouseId: string;
  ordered: string;
  unitName: string;
}) {
  const [checkedQuantity, setCheckedQuantity] = useState(ordered);
  useEffect(() => {
    const timer = setTimeout(() => setCheckedQuantity(ordered), 300);
    return () => clearTimeout(timer);
  }, [ordered]);
  const count = quantity(checkedQuantity);
  const enabled = !!productId && !!unitId && !!warehouseId && count !== null;
  const preview = useQuery({
    queryKey: ["availability", userId, productId, unitId, count],
    queryFn: async ({ signal }) =>
      (
        await request<{ data: Availability }>(
          `/inventory/availability?${new URLSearchParams({ productId, unitId: String(unitId), requestedQuantity: String(count) })}`,
          { signal },
        )
      ).data,
    enabled,
    staleTime: 0,
    retry: false,
  });
  if (!productId || !unitId || !warehouseId) return null;
  if (quantity(ordered) === null)
    return (
      <p className="sale-stock-preview error" role="status">
        Enter a whole quantity of at least 1.
      </p>
    );
  if (preview.fetchStatus === "paused")
    return (
      <p className="sale-stock-preview warning" role="status">
        You are offline. Reconnect to check warehouse stock. No goods are
        reserved.
      </p>
    );
  if (ordered !== checkedQuantity || preview.isFetching || preview.isPending)
    return (
      <p className="sale-stock-preview" role="status">
        Checking warehouse stock…
      </p>
    );
  if (preview.isError)
    return (
      <div className="sale-stock-preview error" role="status">
        Stock could not be checked: {preview.error.message}{" "}
        <button
          type="button"
          className="sale-text-button"
          onClick={() => preview.refetch()}
        >
          Retry stock check
        </button>
      </div>
    );
  const stock = preview.data.warehouses.find(
    (w) => w.warehouseId === Number(warehouseId),
  );
  const sufficient = stock?.sufficientForRequestedQuantity === true;
  return (
    <p
      className={`sale-stock-preview ${sufficient ? "available" : "warning"}`}
      role="status"
    >
      {sufficient ? "Stock available" : "Insufficient stock"}:{" "}
      {stock?.availableQuantityInRequestedUnit ?? 0} × {unitName} available (
      {stock?.sellableQuantityBase ?? 0} base units).
      {!sufficient &&
        " You can add the order for later delivery; only available goods can be handed over."}
      <small>
        Informational check, not a reservation. Stock is checked again at
        handover.
      </small>
    </p>
  );
}
