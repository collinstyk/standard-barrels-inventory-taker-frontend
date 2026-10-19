export function statusTone(value: string | undefined): string {
  if (
    [
      "FULLY_PAID",
      "FULLY_DELIVERED",
      "FULLY_RECEIVED",
      "COMPLETED",
      "POSTED",
    ].includes(value || "")
  )
    return "good";
  if (
    ["PARTLY_PAID", "PARTLY_DELIVERED", "PARTLY_RECEIVED"].includes(value || "")
  )
    return "partial";
  if (["NOT_PAID", "NOT_DELIVERED", "NOT_RECEIVED"].includes(value || ""))
    return "unpaid";
  return value === "CANCELLED" ? "bad" : "neutral";
}
