"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
}

export function VideoRoom({ bookingId, role, participantName, otherPartyName, priceRub }: VideoRoomProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [videoSessionId, setVideoSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  const lkUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://localhost:7880";

  useEffect(() => {
    fetch(`/api/video/token?bookingId=${bookingId}`)
      .then(r => r.json())
      .then(d => {
        if (d.token) {
          setToken(d.token);
          setConnecting(false);
        } else {
          setError(d.error ?? "Не удалось получить токен");
          setConnecting(false);
        }
      })
      .catch(() => { setError("Ошибка подключения"); setConnecting(false); });

    // Получаем videoSessionId
    fetch(`/api/video/session?bookingId=${bookingId}`)
      .then(r => r.json())
      .then(d => { if (d.session?.id) setVideoSessionId(d.session.id); });
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
      onDisconnected={() => router.push(role === "client" ? "/cabinet/bookings" : "/cabinet/practitioner/clients")}
    >
      <VideoRoomInner
        bookingId={bookingId}
        videoSessionId={videoSessionId}
        role={role}
        participantName={participantName}
        otherPartyName={otherPartyName}
        priceRub={priceRub}
      />
    </LiveKitRoom>
  );
}

function VideoRoomInner({
  bookingId,
  videoSessionId,
  role,
  participantName,
  otherPartyName,
  priceRub,
}: {
  bookingId: string;
  videoSessionId: string | null;
  role: "client" | "practitioner";
  participantName: string;
  otherPartyName: string;
  priceRub: number;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [violation, setViolation] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const sessionStartedAt = useMemo(() => new Date(), []); // фиксируем время при монтировании
  const containerRef = useRef<HTMLDivElement>(null);
  const transcriptBuffer = useRef<string>("");
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Отправляем запрос об активации сессии один раз при монтировании
  useEffect(() => {
    fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ACTIVE" }),
    }).catch(() => {});
  }, [bookingId]);

  // Периодическая проверка транскрипта на нарушения (каждые 30 сек)
  useEffect(() => {
    if (!videoSessionId) return;
    transcriptTimer.current = setInterval(async () => {
      const text = transcriptBuffer.current.trim();
      if (!text || text.length < 20) return;

      try {
        const res = await fetch("/api/video/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoSessionId, text, isFinal: false }),
        });
        const d = await res.json();
        if (d.violation) setViolation(d.violation);
      } catch { /* ignore */ }
    }, 30000);

    return () => { if (transcriptTimer.current) clearInterval(transcriptTimer.current); };
  }, [videoSessionId]);

  async function handleLeave() {
    // Завершаем сессию
    await fetch("/api/video/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "ENDED" }),
    }).catch(() => {});

    room.disconnect();
    router.push(role === "client" ? "/cabinet/bookings" : "/cabinet/practitioner/clients");
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
          <SessionTimer startedAt={sessionStartedAt} durationMin={60} />
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
          <div className="absolute inset-0 flex items-center justify-center">
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
    </div>
  );
}
