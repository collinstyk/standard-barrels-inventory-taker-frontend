import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppSelect } from "./components/AppSelect";
import { ApiError, type ApiList } from "./api";
import { cachedRequest, queryClient } from "./query";

type UnitQuantity = { unitId: number; availableQuantityInUnit: number; baseUnitRemainder: number };
type Unit = UnitQuantity & { name: string; multiplier: number; sku: string };
type Warehouse = {
  warehouseId: number;
  warehouseName: string;
  warehouseLocation: string | null;
  sellableQuantityBase: number;
  stockLevel: "CRITICAL" | "LOW" | "NORMAL";
  unitQuantities: UnitQuantity[];
};
type Product = {
  productId: string;
  productName: string;
  baseUnit: string;
  reorderPoint: number;
  units: Unit[];
  sellableQuantityBase: number;
  stockLevel: "CRITICAL" | "LOW" | "NORMAL";
  warehouses: Warehouse[];
};
type AvailabilityPage = ApiList<Product> & { evaluatedAt: string; informationalOnly: true };

function AvailabilityRow({ product }: { product: Product }) {
  const [unitId, setUnitId] = useState(String(product.units[0]?.unitId ?? ""));
  const [warehouseId, setWarehouseId] = useState("all");
  const unit = product.units.find((item) => String(item.unitId) === unitId) ?? product.units[0];
  const warehouse = product.warehouses.find((item) => String(item.warehouseId) === warehouseId);
  const quantity = warehouse
    ? warehouse.unitQuantities.find((item) => item.unitId === unit?.unitId)?.availableQuantityInUnit ?? 0
    : unit?.availableQuantityInUnit ?? 0;
  const remainder = warehouse
    ? warehouse.unitQuantities.find((item) => item.unitId === unit?.unitId)?.baseUnitRemainder ?? 0
    : unit?.baseUnitRemainder ?? 0;
  const tone = warehouse?.stockLevel ?? product.stockLevel;

  return (
    <tr>
      <td data-label="Product"><strong>{product.productName}</strong><small>Reorder at {product.reorderPoint.toLocaleString()} {product.baseUnit}</small></td>
      <td data-label="Unit">{product.units.length > 1 ? (
        <AppSelect value={String(unit?.unitId ?? "")} onValueChange={setUnitId} aria-label={`Unit for ${product.productName}`}
          options={product.units.map((item) => ({ value: String(item.unitId), label: <>{item.name}</> }))} />
      ) : <span>{unit?.name || product.baseUnit}</span>}</td>
      <td data-label="Warehouse">{product.warehouses.length > 1 ? (
        <AppSelect value={warehouseId} onValueChange={setWarehouseId} aria-label={`Warehouse for ${product.productName}`}
          options={[{ value: "all", label: <>All warehouses</> }, ...product.warehouses.map((item) => ({ value: String(item.warehouseId), label: <>{item.warehouseName}</> }))]} />
      ) : <span>{product.warehouses[0]?.warehouseName || "No sellable stock"}</span>}</td>
      <td data-label="Available"><strong className={`stock-quantity ${tone.toLowerCase()}`}>{quantity.toLocaleString()}</strong>
        {remainder > 0 && unit && <small>+ {remainder.toLocaleString()} {product.baseUnit} remainder</small>}
      </td>
    </tr>
  );
}

export function InventoryAvailability() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const path = `/inventory/availability-list?page=${page}&limit=20${term ? `&search=${encodeURIComponent(term)}` : ""}`;
  const query = useQuery({ queryKey: ["inventory-availability-list", path], queryFn: () => cachedRequest<AvailabilityPage>(path), retry: false });
  const invalidPayload = Boolean(query.data && !Array.isArray(query.data.data));
  const rows = query.data && !invalidPayload ? query.data.data : [];
  const pagination = query.data?.pagination;
  return (
    <div className="panel">
      <div className="panel-head">
        <div><h2>Inventory availability</h2><p>Sellable stock across warehouses. Recheck at dispatch.</p></div>
        <button className="subtle" onClick={() => void queryClient.invalidateQueries({ queryKey: ["api-read", path] }).then(() => query.refetch())} disabled={query.isFetching}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <div className="inventory-toolbar">
        <label className="inventory-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search products by name</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products by name" /></label>
        <span className="muted">{pagination?.total ?? 0} products</span>
      </div>
      {query.isPending ? <div className="state">Loading inventory…</div>
        : query.isError || invalidPayload ? <div className="state" role="alert"><h3>{(query.error as ApiError)?.status === 403 ? "Permission denied" : "Could not load inventory"}</h3><p>{invalidPayload ? "The server returned an unexpected inventory response." : (query.error as Error).message}</p><button className="subtle" onClick={() => void query.refetch()}>Retry</button></div>
        : rows.length ? <div className="table-scroll"><table className="inventory-table"><thead><tr><th>Product</th><th>Unit</th><th>Warehouse</th><th>Available</th></tr></thead>
          <tbody>{rows.map((product) => <AvailabilityRow key={product.productId} product={product} />)}</tbody></table></div>
        : <div className="state"><h3>No products found</h3><p>{term ? "Try another product name." : "Add products to start tracking inventory."}</p></div>}
      {pagination && pagination.totalPages > 1 && <div className="inventory-pagination"><span>Page {pagination.page} of {pagination.totalPages}</span>
        <div><button className="subtle" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</button>
          <button className="subtle" disabled={page >= pagination.totalPages || query.isFetching} onClick={() => setPage(page + 1)}>Next</button></div></div>}
    </div>
  );
}
