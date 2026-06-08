import {
  createGuestSessionCookieValue,
  GUEST_SESSION_COOKIE,
  readGuestSessionIdFromCookieValue,
} from "@/lib/guest-session";

describe("guest session identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates and validates a signed guest cookie value", () => {
    const value = createGuestSessionCookieValue("gst_00000000-0000-4000-8000-000000000000");

    expect(readGuestSessionIdFromCookieValue(value)).toBe("gst_00000000-0000-4000-8000-000000000000");
    expect(readGuestSessionIdFromCookieValue(value.replace("gst_", "bad_"))).toBeNull();
    expect(readGuestSessionIdFromCookieValue(`${value}tampered`)).toBeNull();
  });
});
