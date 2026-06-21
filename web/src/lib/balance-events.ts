// #3: cross-component signal so the header credit pill re-fetches immediately
// after credits are spent (opening a paid product) or topped up — not only after
// a page reload. Producers call dispatchBalanceChanged(); the header listens.
export const BALANCE_CHANGED_EVENT = "eterapy:balance-changed";

export function dispatchBalanceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BALANCE_CHANGED_EVENT));
  }
}
