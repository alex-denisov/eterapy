import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B467 / PRB-003 — production video-session contract", () => {
  it("renders remote audio, adaptive video, reconnect state and responsive room chrome", () => {
    const room = source("src/components/video/video-room.tsx");

    expect(room).toContain("<RoomAudioRenderer");
    expect(room).toContain("<StartAudio");
    expect(room).toContain("adaptiveStream: true");
    expect(room).toContain("dynacast: true");
    expect(room).toContain("useConnectionState");
    expect(room).toContain("ConnectionState.Reconnecting");
    expect(room).toContain("h-[100dvh]");
    expect(room).toContain("lg:mr-96");
    expect(room).toContain("lg:w-96");
  });

  it("applies blur to the outgoing LocalVideoTrack and never to the remote video element", () => {
    const room = source("src/components/video/video-room.tsx");

    expect(room).toContain('import("@livekit/track-processors")');
    expect(room).toContain("track instanceof LocalVideoTrack");
    expect(room).toContain("await track.setProcessor(processor)");
    expect(room).toContain('mode: "background-blur"');
    expect(room).not.toContain("[&>video]:blur-xl");
  });

  it("provides mic, camera, screen-share, device selection and safe fullscreen controls", () => {
    const controls = source("src/components/video/video-controls.tsx");
    const room = source("src/components/video/video-room.tsx");

    expect(controls).toContain("Track.Source.Microphone");
    expect(controls).toContain("Track.Source.Camera");
    expect(controls).toContain("Track.Source.ScreenShare");
    expect(controls).toContain('kind="audioinput"');
    expect(controls).toContain('kind="videoinput"');
    expect(controls).toContain('kind="audiooutput"');
    expect(room).toContain("document.fullscreenEnabled");
    expect(room).toContain("Mini App");
  });

  it("keeps AI notes practitioner-controlled and exposes post-session AI output", () => {
    const panel = source("src/components/video/session-ai-panel.tsx");
    const recordingRoute = source("src/app/api/video/recording/route.ts");
    const serverStt = source("src/lib/server-stt.ts");
    const analysis = source("src/app/cabinet/practitioner/sessions/[id]/page.tsx");

    expect(panel).toContain("Включить для этой сессии");
    expect(panel).not.toContain("Согласен на аудиозапись");
    expect(panel).not.toContain("Расшифровываем");
    expect(panel).not.toContain("Аудиозапись включена");
    expect(panel).not.toContain("toast.");
    expect(panel).toContain('mode: "server_stt"');
    expect(recordingRoute).not.toContain("recordingConsentClientAt");
    expect(recordingRoute).not.toContain("recordingConsentPractitionerAt");
    expect(serverStt).toContain("Только практик может запустить");
    expect(serverStt).toContain('serverSttStatus: "completed"');
    expect(serverStt).toContain("audioDeleted");
    expect(serverStt).toContain("generateSessionSummary");
    expect(analysis).toContain("clientFollowupDraft");
    expect(analysis).toContain("practitionerNotesText");
  });

  it("does not reset the shared timer or mark the video row ended before the 75% gate", () => {
    const sessionRoute = source("src/app/api/video/session/route.ts");
    const tokenRoute = source("src/app/api/video/token/route.ts");

    expect(sessionRoute).toContain("videoSession.startedAt ? {}");
    expect(sessionRoute).toContain("completeBookingAtSessionEnd");
    expect(sessionRoute).toContain('status: "ENDED"');
    expect(sessionRoute.indexOf("completeBookingAtSessionEnd")).toBeLessThan(
      sessionRoute.lastIndexOf('status: "ENDED"'),
    );
    expect(tokenRoute).toContain("videoSessionId: videoSession.id");
  });
});
