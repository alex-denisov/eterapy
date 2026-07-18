"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { VideoChat } from "./video-chat";
import { VideoControls } from "./video-controls";
import { ViolationBanner } from "./violation-banner";
import { SessionTimer } from "./session-timer";

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

    // Получаем videoSessionId и startedAt
    const sessionTimer = window.setTimeout(() => {
      fetch(`/api/video/session?bookingId=${bookingId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.session?.id) setVideoSessionId(d.session.id);
        if (d.session?.startedAt) setSessionStartedAt(new Date(d.session.startedAt));
      })
      .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tokenTimer);
      window.clearTimeout(sessionTimer);
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
      audio={true}
      video={true}
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
  const { localParticipant } = useLocalParticipant();
  const [violation, setViolation] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [bgBlur, setBgBlur] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const transcriptBuffer = useRef<string>("");
  const transcriptSegments = useRef<TranscriptSegment[]>([]);
  const sttStartedAt = useRef<number | null>(null);
  const speechRecognition = useRef<SpeechRecognitionLike | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const res = await fetch("/api/video/transcript", {
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
      const d = await res.json();
      if (d.violation) setViolation(d.violation);
    } catch { /* ignore */ }
  }, [videoSessionId]);

  const handleSessionEnd = useCallback(async () => {
    if (sessionEnded) return;
    setSessionEnded(true);
    await flushTranscript(true);

    await fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ENDED" }),
    }).catch(() => {});

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
    if (!videoSessionId) return;
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
          speakerRole: role,
          speakerLabel: role === "client" ? "Клиент" : "Практик",
          text,
          startedAtMs,
          endedAtMs,
          isFinal: true,
        });
        transcriptBuffer.current = `${transcriptBuffer.current}\n${role === "client" ? "Клиент" : "Практик"}: ${text}`.trim();
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
  }, [role, sessionEnded, videoSessionId]);

  // Периодическая проверка транскрипта на нарушения (каждые 30 сек)
  useEffect(() => {
    if (!videoSessionId) return;
    transcriptTimer.current = setInterval(async () => {
      await flushTranscript(false);
    }, 30000);

    return () => { if (transcriptTimer.current) clearInterval(transcriptTimer.current); };
  }, [flushTranscript, videoSessionId]);

  async function handleLeave() {
    await flushTranscript(true);
    // Завершаем сессию
    await fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ENDED" }),
    }).catch(() => {});

    room.disconnect();
    router.push(exitHref);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  const remoteTracks = useTracks([Track.Source.Camera, Track.Source.Microphone], { onlySubscribed: true });
  const remoteVideoTrack = remoteTracks.find(t => t.source === Track.Source.Camera);

  const localTracks = useTracks([Track.Source.Camera, Track.Source.Microphone], { onlySubscribed: false });
  const localVideoTrack = localTracks.find(t => t.source === Track.Source.Camera);

  return (
    <div ref={containerRef} className="flex h-screen bg-video-bg overflow-hidden">
      {/* Уведомление о нарушении */}
      {violation && (
        <ViolationBanner message={violation} onClose={() => setViolation(null)} />
      )}

      {/* Основная область */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all ${showChat ? "mr-80" : ""}`}>

        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-video-surface border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium">{otherPartyName}</span>
            <span className="text-xs text-muted-foreground">{priceRub.toLocaleString("ru")} ₽/сессия</span>
          </div>
          {/* Таймер сессии */}
          <SessionTimer startedAt={sessionStartedAt} durationMin={sessionDurationMin} />
          <div className="flex gap-2">
            <button onClick={() => setShowChat(!showChat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                showChat ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:text-foreground"
              }`}>
              💬 Чат
            </button>
          </div>
        </div>

        {/* Видео */}
        <div className="flex-1 relative bg-black">
          {/* Удалённое видео (большое) */}
          <div className={`absolute inset-0 flex items-center justify-center ${bgBlur ? "[&>video]:blur-xl [&>video]:scale-105" : ""}`}>
            {remoteVideoTrack ? (
              <VideoTrack trackRef={remoteVideoTrack} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center text-4xl font-bold text-primary">
                  {otherPartyName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="text-sm">{otherPartyName} подключается...</p>
              </div>
            )}
          </div>

          {/* Локальное видео (pip) */}
          <div className="absolute bottom-4 right-4 w-32 h-24 rounded-xl overflow-hidden border border-white/20 shadow-lg">
            {localVideoTrack ? (
              <VideoTrack trackRef={localVideoTrack} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-video-surface flex items-center justify-center text-2xl font-bold text-primary">
                {participantName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </div>

          {/* Имя участника */}
          <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-1.5">
            <p className="text-xs text-white">{participantName} · {role === "client" ? "Клиент" : "Практик"}</p>
          </div>
        </div>

        {/* Панель управления */}
        <VideoControls
          room={room}
          localParticipant={localParticipant}
          onLeave={handleLeave}
          onFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          role={role}
          videoSessionId={videoSessionId}
          bookingId={bookingId}
          bgBlur={bgBlur}
          onBgBlurChange={() => setBgBlur(!bgBlur)}
        />
      </div>

      {/* Правая панель — чат */}
      {showChat && (
        <div className="fixed right-0 top-0 bottom-0 w-80 border-l border-white/10 bg-video-surface flex flex-col z-10">
          <VideoChat
            videoSessionId={videoSessionId}
            participantName={participantName}
            role={role}
          />
        </div>
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
