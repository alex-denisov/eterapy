"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { ConnectionState, LocalVideoTrack, Track } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { toast } from "sonner";
import { VideoChat } from "./video-chat";
import { VideoControls } from "./video-controls";
import { SessionTimer } from "./session-timer";
import { SessionAiPanel } from "./session-ai-panel";

interface VideoRoomProps {
  bookingId: string;
  role: "client" | "practitioner";
  participantName: string;
  otherPartyName: string;
  priceRub: number;
  sessionDurationMin: number;
  exitHref?: string;
}

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type TranscriptSegment = {
  speakerRole: "client" | "practitioner";
  speakerLabel: string;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
  isFinal: boolean;
};

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function VideoRoom({ bookingId, role, participantName, otherPartyName, priceRub, sessionDurationMin, exitHref }: VideoRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [videoSessionId, setVideoSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  const lkUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://localhost:7880";
  const resolvedExitHref = exitHref ?? (role === "client" ? "/cabinet/bookings" : "/cabinet/practitioner/clients");

  useEffect(() => {
    let cancelled = false;
    const tokenTimer = window.setTimeout(() => {
      fetch(`/api/video/token?bookingId=${bookingId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.token) {
          setToken(d.token);
          if (d.videoSessionId) setVideoSessionId(d.videoSessionId);
          if (d.startedAt) setSessionStartedAt(new Date(d.startedAt));
          setConnecting(false);
        } else {
          setError(d.error ?? "Не удалось получить токен");
          setConnecting(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Ошибка подключения");
          setConnecting(false);
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(tokenTimer);
    };
  }, [bookingId]);

  if (connecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-video-loading">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Подключение к сессии...</p>
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-video-loading px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="font-heading text-xl font-bold mb-2">Не удалось подключиться</h1>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <button onClick={() => router.back()}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-navy">
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={lkUrl}
      connect={true}
      audio={{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }}
      video={{ resolution: { width: 1280, height: 720 }, facingMode: "user" }}
      options={{ adaptiveStream: true, dynacast: true }}
      onError={(liveKitError) => setError(liveKitError.message || "Ошибка видеосвязи")}
      onDisconnected={() => router.push(resolvedExitHref)}
    >
      <VideoRoomInner
        bookingId={bookingId}
        videoSessionId={videoSessionId}
        sessionStartedAt={sessionStartedAt}
        setSessionStartedAt={setSessionStartedAt}
        role={role}
        participantName={participantName}
        otherPartyName={otherPartyName}
        priceRub={priceRub}
        sessionDurationMin={sessionDurationMin}
        exitHref={resolvedExitHref}
      />
    </LiveKitRoom>
  );
}

function VideoRoomInner({
  bookingId,
  videoSessionId,
  sessionStartedAt,
  setSessionStartedAt,
  role,
  participantName,
  otherPartyName,
  priceRub,
  sessionDurationMin,
  exitHref,
}: {
  bookingId: string;
  videoSessionId: string | null;
  sessionStartedAt: Date | null;
  setSessionStartedAt: (d: Date | null) => void;
  role: "client" | "practitioner";
  participantName: string;
  otherPartyName: string;
  priceRub: number;
  sessionDurationMin: number;
  exitHref: string;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [bgBlur, setBgBlur] = useState(false);
  const [bgBlurBusy, setBgBlurBusy] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiCaptureActive, setAiCaptureActive] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const backgroundProcessor = useRef<BackgroundProcessorWrapper | null>(null);
  const processedVideoTrack = useRef<LocalVideoTrack | null>(null);
  const transcriptBuffer = useRef<string>("");
  const transcriptSegments = useRef<TranscriptSegment[]>([]);
  const sttStartedAt = useRef<number | null>(null);
  const speechRecognition = useRef<SpeechRecognitionLike | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionState = useConnectionState(room);

  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 1024px)");
    const timer = window.setTimeout(() => setShowChat(wideScreen.matches), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Restore the practitioner's local live-compliance fallback after a reload.
  // This is deliberately silent and never runs in the client interface.
  useEffect(() => {
    if (role !== "practitioner") return;
    let cancelled = false;
    const refresh = async () => {
      const response = await fetch(`/api/video/recording?bookingId=${encodeURIComponent(bookingId)}`)
        .catch(() => null);
      if (!response?.ok || cancelled) return;
      const data = await response.json().catch(() => null);
      if (!cancelled) {
        setAiCaptureActive(["queued", "processing"].includes(data?.serverStt?.status));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bookingId, role]);

  // Отправляем запрос об активации сессии один раз при монтировании
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ACTIVE" }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.session?.startedAt) setSessionStartedAt(new Date(d.session.startedAt));
      })
      .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookingId, setSessionStartedAt]);

  const flushTranscript = useCallback(async (isFinal: boolean) => {
    if (!videoSessionId) return;
    const text = transcriptBuffer.current.trim();
    if (!text || text.length < 20) return;
    try {
      await fetch("/api/video/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoSessionId,
          text,
          segments: transcriptSegments.current.slice(-600),
          isFinal,
          sttProvider: "web_speech_api",
          sttSource: "browser_speech_recognition",
        }),
      });
      // Compliance results remain in the server audit trail. They are not
      // surfaced during the call, so neither participant is distracted.
    } catch { /* ignore */ }
  }, [videoSessionId]);

  const handleSessionEnd = useCallback(async () => {
    if (sessionEnded) return;
    setSessionEnded(true);
    await flushTranscript(true);

    const response = await fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ENDED" }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setSessionEnded(false);
      toast.error(data?.error ?? "Не удалось корректно завершить сессию");
      return;
    }

    room.disconnect();
    setShowEndModal(true);
  }, [bookingId, flushTranscript, room, sessionEnded]);

  // Таймер ограничения длительности сессии
  useEffect(() => {
    if (!sessionStartedAt || sessionDurationMin <= 0 || sessionEnded) return;

    const endTime = sessionStartedAt.getTime() + sessionDurationMin * 60 * 1000;
    const warningTime = endTime - 60 * 1000; // за 1 минуту до конца
    const now = Date.now();

    // Если время уже вышло
    if (now >= endTime) {
      endTimer.current = setTimeout(() => {
        void handleSessionEnd();
      }, 0);
      return;
    }

    // Показать предупреждение за 1 минуту
    if (now >= warningTime) {
      warningTimer.current = setTimeout(() => {
        setShowEndModal(true);
      }, 0);
    } else {
      warningTimer.current = setTimeout(() => {
        setShowEndModal(true);
      }, warningTime - now);
    }

    // Завершить сессию по окончании
    endTimer.current = setTimeout(() => {
      void handleSessionEnd();
    }, endTime - now);

    return () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, [handleSessionEnd, sessionStartedAt, sessionDurationMin, sessionEnded]);

  useEffect(() => {
    // Browser STT is only a live-compliance fallback and begins after the
    // practitioner enables the AI-conспект for the active session.
    if (!videoSessionId || role !== "practitioner" || !aiCaptureActive) return;
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    speechRecognition.current = recognition;
    sttStartedAt.current ??= Date.now();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ru-RU";
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim();
        if (!text || !result?.isFinal) continue;
        const now = Date.now();
        const startedAt = sttStartedAt.current ?? now;
        const startedAtMs = Math.max(0, now - startedAt - 3000);
        const endedAtMs = Math.max(startedAtMs, now - startedAt);
        transcriptSegments.current.push({
          speakerRole: "practitioner",
          speakerLabel: "Практик",
          text,
          startedAtMs,
          endedAtMs,
          isFinal: true,
        });
        transcriptBuffer.current = `${transcriptBuffer.current}\nПрактик: ${text}`.trim();
      }
    };
    recognition.onerror = () => undefined;
    recognition.onend = () => {
      if (!sessionEnded) {
        try { recognition.start(); } catch { /* already started or blocked */ }
      }
    };
    try { recognition.start(); } catch { /* browser may require prior mic permission */ }

    return () => {
      recognition.onend = null;
      try { recognition.stop(); } catch { /* ignore */ }
      speechRecognition.current = null;
    };
  }, [aiCaptureActive, role, sessionEnded, videoSessionId]);

  // Периодическая проверка транскрипта на нарушения (каждые 30 сек)
  useEffect(() => {
    if (!videoSessionId || role !== "practitioner" || !aiCaptureActive) return;
    transcriptTimer.current = setInterval(async () => {
      await flushTranscript(false);
    }, 30000);

    return () => { if (transcriptTimer.current) clearInterval(transcriptTimer.current); };
  }, [aiCaptureActive, flushTranscript, role, videoSessionId]);

  async function handleLeave() {
    await flushTranscript(true);
    const response = await fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ENDED" }),
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      toast.error(data?.error ?? "Не удалось завершить сессию");
      return false;
    }

    room.disconnect();
    router.push(exitHref);
    return true;
  }

  function toggleFullscreen() {
    if (!document.fullscreenEnabled || !containerRef.current?.requestFullscreen) {
      toast.info("Комната уже занимает весь экран", {
        description: "На iPhone и в Mini App системный полноэкранный режим управляется самим приложением.",
      });
      return;
    }
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen().catch(() => {
        toast.error("Браузер не разрешил полноэкранный режим");
      });
    } else {
      void document.exitFullscreen();
    }
  }

  const roomTracks = useTracks(
    [Track.Source.Camera, Track.Source.Microphone, Track.Source.ScreenShare],
    { onlySubscribed: false },
  );
  const remoteVideoTrack = roomTracks.find(
    (track) => track.source === Track.Source.Camera && !track.participant.isLocal,
  );
  const remoteScreenTrack = roomTracks.find(
    (track) => track.source === Track.Source.ScreenShare && !track.participant.isLocal,
  );
  const localScreenTrack = roomTracks.find(
    (track) => track.source === Track.Source.ScreenShare && track.participant.isLocal,
  );
  const mainVideoTrack = remoteScreenTrack ?? localScreenTrack ?? remoteVideoTrack;
  const screenIsMain = mainVideoTrack?.source === Track.Source.ScreenShare;

  const localVideoTrack = roomTracks.find(
    (track) => track.source === Track.Source.Camera && track.participant.isLocal,
  );

  const setBackgroundBlur = useCallback(async (enabled: boolean) => {
    const track = localVideoTrack?.publication.track;
    if (!(track instanceof LocalVideoTrack)) {
      toast.error("Сначала включите камеру");
      return false;
    }

    setBgBlurBusy(true);
    try {
      const {
        BackgroundProcessor,
        supportsBackgroundProcessors,
      } = await import("@livekit/track-processors");
      if (!supportsBackgroundProcessors()) {
        toast.error("Размытие фона не поддерживается этим браузером", {
          description: "Камера продолжит работать без обработки. Попробуйте актуальный Chrome, Edge или Safari.",
        });
        return false;
      }

      if (!backgroundProcessor.current || processedVideoTrack.current !== track) {
        if (processedVideoTrack.current) {
          await processedVideoTrack.current.stopProcessor().catch(() => undefined);
        }
        const processor = BackgroundProcessor({ mode: "disabled" });
        await track.setProcessor(processor);
        backgroundProcessor.current = processor;
        processedVideoTrack.current = track;
      }

      await backgroundProcessor.current.switchTo(
        enabled ? { mode: "background-blur", blurRadius: 14 } : { mode: "disabled" },
      );
      setBgBlur(enabled);
      return true;
    } catch (blurError) {
      toast.error("Не удалось изменить фон", {
        description: blurError instanceof Error ? blurError.message : "Браузер отклонил видеообработку",
      });
      return false;
    } finally {
      setBgBlurBusy(false);
    }
  }, [localVideoTrack]);

  useEffect(() => () => {
    if (processedVideoTrack.current) {
      void processedVideoTrack.current.stopProcessor().catch(() => undefined);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-[100dvh] min-h-[100svh] overflow-hidden bg-video-bg text-foreground"
      data-testid="video-room"
    >
      <RoomAudioRenderer />
      <StartAudio label="Нажмите, чтобы включить звук собеседника" />
      {/* Основная область */}
      <div className={`flex min-w-0 flex-1 flex-col transition-all ${showChat ? "lg:mr-96" : ""}`}>

        {/* Шапка */}
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-white/10 bg-video-surface px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                connectionState === ConnectionState.Connected
                  ? "bg-emerald-400"
                  : connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting
                    ? "animate-pulse bg-amber-400"
                    : "animate-pulse bg-red-500"
              }`}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium">{otherPartyName}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {priceRub.toLocaleString("ru")} ₽/сессия
            </span>
            {connectionState !== ConnectionState.Connected && (
              <span className="hidden text-xs text-amber-300 md:inline" role="status">
                {connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting
                  ? "Восстанавливаем связь…"
                  : "Подключаемся…"}
              </span>
            )}
          </div>
          {/* Таймер сессии */}
          <SessionTimer startedAt={sessionStartedAt} durationMin={sessionDurationMin} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowChat(!showChat)}
              className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                showChat ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
              aria-expanded={showChat}
              aria-label={showChat ? "Закрыть чат сессии" : "Открыть чат сессии"}
            >
              <span aria-hidden="true">💬</span> <span className="hidden sm:inline">Чат</span>
            </button>
          </div>
        </div>

        {/* Видео */}
        <div className="relative flex-1 overflow-hidden bg-black">
          {/* Видео собеседника или демонстрация экрана */}
          <div className="absolute inset-0 flex items-center justify-center">
            {mainVideoTrack ? (
              <VideoTrack
                trackRef={mainVideoTrack}
                className={`h-full w-full ${screenIsMain ? "object-contain" : "object-cover"}`}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary sm:h-24 sm:w-24 sm:text-4xl">
                  {otherPartyName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="text-sm">{otherPartyName} подключается...</p>
              </div>
            )}
          </div>

          {/* Локальное видео (pip) */}
          <div className="absolute bottom-3 right-3 h-20 w-28 overflow-hidden rounded-xl border border-white/20 bg-video-surface shadow-lg sm:bottom-4 sm:right-4 sm:h-28 sm:w-40">
            {localVideoTrack ? (
              <VideoTrack
                trackRef={localVideoTrack}
                className="h-full w-full -scale-x-100 object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-video-surface text-2xl font-bold text-primary">
                {participantName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              Вы
            </span>
          </div>

          {/* Имя собеседника / источник демонстрации */}
          <div className="absolute bottom-3 left-3 max-w-[calc(100%-9rem)] truncate rounded-lg bg-black/60 px-3 py-1.5 sm:bottom-4 sm:left-4">
            <p className="truncate text-xs text-white">
              {screenIsMain
                ? `${mainVideoTrack?.participant.isLocal ? "Вы" : otherPartyName} · демонстрация экрана`
                : otherPartyName}
            </p>
          </div>
        </div>

        {/* Панель управления */}
        <VideoControls
          room={room}
          onLeave={handleLeave}
          onFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          role={role}
          bgBlur={bgBlur}
          bgBlurBusy={bgBlurBusy}
          onBgBlurChange={setBackgroundBlur}
          onOpenAiPanel={() => setShowAiPanel(true)}
          aiCaptureActive={aiCaptureActive}
        />
      </div>

      {/* Правая панель — чат */}
      {showChat && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col border-l border-white/10 bg-video-surface shadow-2xl lg:left-auto lg:top-0 lg:w-96">
          <VideoChat
            videoSessionId={videoSessionId}
            participantName={participantName}
            role={role}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}

      {showAiPanel && role === "practitioner" && (
        <SessionAiPanel
          bookingId={bookingId}
          onClose={() => setShowAiPanel(false)}
          onServerCaptureActive={setAiCaptureActive}
        />
      )}

      {/* Модальное окно завершения сессии */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-video-surface p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <span className="text-3xl">⏱️</span>
            </div>
            <h2 className="mb-2 text-xl font-bold font-heading">Сессия завершена</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Время вашей сессии истекло. Спасибо за использование ETerapy!
            </p>
            <button
              onClick={() => router.push(exitHref)}
              className="rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/90"
            >
              Перейти к бронированиям
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
