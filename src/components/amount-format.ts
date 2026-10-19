export function formatAmountInput(value: string): string {
  const raw = value.replaceAll(",", "");
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return value;
  const [whole, fractional] = raw.split(".");
  const grouped = (whole || "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractional === undefined ? grouped : `${grouped}.${fractional}`;
}
