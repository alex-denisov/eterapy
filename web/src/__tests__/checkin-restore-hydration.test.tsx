/**
 * Regression: M27 «разбор» restore path hydration (React #418).
 *
 * `/checkin?dialogueId=<id>` must produce the SAME initial (synchronous)
 * markup on the client as the windowless server render. The Next.js server
 * never sees `window`, so the restore banner is OFF at hydration time and the
 * ask-card hint reads «Бесплатно, без регистрации.». If the client's first
 * render branches on `window.location.search` (as a `useState` lazy
 * initializer once did — commit b7981b2), the text node diverges from the
 * server HTML and React throws hydration error #418 ("Text content does not
 * match server-rendered HTML") on initial load, before any user interaction.
 *
 * `renderToString` performs only the initial render (no effects), so its
 * output is exactly the markup React diffs against during hydration — which
 * makes it a faithful, window-independent reproduction of the mismatch that
 * plain jsdom (where `window` is always defined) cannot surface.
 */
import { renderToString } from "react-dom/server";
import CheckinPage from "@/app/checkin/page";

const RESTORING_COPY = "Восстанавливаю сохраненный диалог";

function renderInitial(search: string): string {
  window.history.replaceState(null, "", `/checkin${search}`);
  return renderToString(<CheckinPage />);
}

describe("checkin restore-path hydration (React #418)", () => {
  it("renders the server-consistent ask-card hint when ?dialogueId= is present", () => {
    const html = renderInitial("?dialogueId=test-dialogue-123");
    // The windowless server always renders the non-restoring copy; the
    // client's first render must match it to avoid a text-node mismatch.
    expect(html).toContain("Бесплатно, без регистрации.");
    expect(html).not.toContain(RESTORING_COPY);
  });

  it("produces a window-independent initial render for the ask-card hint", () => {
    const withId = renderInitial("?dialogueId=test-dialogue-123");
    const without = renderInitial("");
    const hint = new RegExp(`Бесплатно, без регистрации\\.|${RESTORING_COPY}`);
    expect(withId.match(hint)?.[0]).toBe(without.match(hint)?.[0]);
  });
});
