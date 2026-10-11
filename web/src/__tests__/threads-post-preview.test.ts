import { decodeHtmlEntities, parseThreadsPreview, threadsPreviewPath } from "@/lib/marketing/threads-post-preview";
import { extractThreadsPostUrl } from "@/lib/marketing/threads-manual-card";

describe("threads post preview", () => {
  it("принимает только ссылки Threads нужного вида", () => {
    expect(threadsPreviewPath("https://www.threads.com/share/BCL13iqHUh/")).toBe("/share/BCL13iqHUh/");
    expect(threadsPreviewPath("https://www.threads.com/@ss_tarolog/post/DeVCic4jaYa?xmt=1")).toBe("/@ss_tarolog/post/DeVCic4jaYa");
    expect(threadsPreviewPath("https://evil.example/share/abc")).toBeNull();
    expect(threadsPreviewPath("http://www.threads.com/share/abc")).toBeNull();
    expect(threadsPreviewPath("https://www.threads.com/api/graphql")).toBeNull();
    expect(threadsPreviewPath("https://www.threads.com.evil.io/share/abc")).toBeNull();
  });

  it("вынимает автора и текст из og-метаданных", () => {
    const html = '<meta property="og:title" content="Имя (&#064;ss_tarolog) on Threads" />'
      + '<meta property="og:description" content="&#x1f56f;&#xfe0f; Раки, Девы &#x2014; коснитесь." />';
    expect(parseThreadsPreview(html)).toEqual({ author: "@ss_tarolog", text: "🕯️ Раки, Девы — коснитесь." });
  });

  it("без описания превью нет", () => {
    expect(parseThreadsPreview("<html></html>")).toBeNull();
  });

  it("декодирует сущности, не ломая неизвестные", () => {
    expect(decodeHtmlEntities("a &amp; b &unknown; &#65;")).toBe("a & b &unknown; A");
  });

  it("ссылка-приглашение /share/ распознаётся как пост", () => {
    expect(extractThreadsPostUrl("глянь https://www.threads.com/share/BCL13iqHUh/ круто")).toBe("https://www.threads.com/share/BCL13iqHUh");
  });
});
