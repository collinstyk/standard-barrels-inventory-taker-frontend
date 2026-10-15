import type { Basket, CheckoutAttempt } from "./checkout-model";

const attemptKey = (userId: string) => `sb-checkout-v1:${userId}`;
const basketKey = (userId: string) => `sb-basket-v1:${userId}`;
export const emptyBasket = (): Basket => ({
  buyerId: "",
  buyerName: "Walk-in customer",
  amountPaid: "",
  lines: [],
});
export function readAttempt(userId: string): CheckoutAttempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(attemptKey(userId)) || "null",
    );
    return value?.version === 1 &&
      value.userId === userId &&
      value.create?.key &&
      value.create?.payload &&
      Array.isArray(value.basket?.lines) &&
      ["creating", "created", "dispatching", "confirmed"].includes(value.phase)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeAttempt(attempt: CheckoutAttempt) {
  try {
    sessionStorage.setItem(attemptKey(attempt.userId), JSON.stringify(attempt));
  } catch {
    throw new Error(
      "Browser session storage is unavailable. Enable it so this confirmation can be recovered safely after a reload.",
    );
  }
}
export function clearAttempt(userId: string) {
  sessionStorage.removeItem(attemptKey(userId));
}
export function readBasket(userId: string): Basket {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(basketKey(userId)) || "null",
    );
    return value &&
      typeof value.buyerId === "string" &&
      typeof value.buyerName === "string" &&
      typeof value.amountPaid === "string" &&
      Array.isArray(value.lines)
      ? value
      : emptyBasket();
  } catch {
    return emptyBasket();
  }
}
export function writeBasket(userId: string, basket: Basket) {
  try {
    sessionStorage.setItem(basketKey(userId), JSON.stringify(basket));
  } catch {
    /* Editing still works without storage; confirmation requires it. */
  }
}
export function clearBasket(userId: string) {
  sessionStorage.removeItem(basketKey(userId));
}
