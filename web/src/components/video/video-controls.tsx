"use client";

import { useState } from "react";
import { Room, LocalParticipant } from "livekit-client";
import { toast } from "sonner";

interface VideoControlsProps {
  room: Room;
  localParticipant: LocalParticipant;
  onLeave: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  role: "client" | "practitioner";
  videoSessionId: string | null;
  bookingId: string;
}

export function VideoControls({
  room,
  localParticipant,
  onLeave,
  onFullscreen,
  isFullscreen,
  role,
  videoSessionId,
  bookingId,
}: VideoControlsProps) {
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [volume, setVolume] = useState(100);
  const [showVolume, setShowVolume] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [bgBlur, setBgBlur] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [egressId, setEgressId] = useState<string | null>(null);

  function toggleMic() {
    localParticipant.setMicrophoneEnabled(!micEnabled);
    setMicEnabled(!micEnabled);
  }

  function toggleCam() {
    localParticipant.setCameraEnabled(!camEnabled);
    setCamEnabled(!camEnabled);
  }

  function handleVolume(v: number) {
    setVolume(v);
    // Устанавливаем громкость для всех удалённых участников
    room.remoteParticipants.forEach(p => {
      p.audioTrackPublications.forEach(pub => {
        if (pub.audioTrack) {
          (pub.audioTrack as unknown as { setVolume: (v: number) => void }).setVolume(v / 100);
        }
      });
    });
  }

  async function handleSummarize() {
    if (!videoSessionId) { toast.error("Сессия не найдена"); return; }
    setSummarizing(true);
    try {
      const res = await fetch("/api/video/transcript", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoSessionId }),
      });
      const d = await res.json();
      if (d.summary) {
        toast.success("Резюме сессии готово", { description: "Доступно в кабинете практика" });
      } else {
        toast.error(d.error ?? "Нет транскрипта для резюме");
      }
    } catch { toast.error("Ошибка"); }
    finally { setSummarizing(false); }
  }

  async function handleLeave() {
    setLeaving(true);
    await onLeave();
  }

  return (
    <div className="flex items-center justify-center gap-3 px-6 py-3 bg-[#0f1e30] border-t border-white/10">
      {/* Громкость */}
      <div className="relative">
        <button onClick={() => setShowVolume(!showVolume)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20 transition-colors"
          title="Громкость">
          {volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
        </button>
        {showVolume && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-[#0f1e30] border border-white/20 rounded-xl p-3 shadow-xl">
            <input type="range" min={0} max={100} value={volume}
              onChange={(e) => handleVolume(Number(e.target.value))}
              className="w-24 accent-primary" />
            <p className="text-xs text-center text-muted-foreground mt-1">{volume}%</p>
          </div>
        )}
      </div>

      {/* Микрофон */}
      <button onClick={toggleMic}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition-colors ${
          micEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        title={micEnabled ? "Выключить микрофон" : "Включить микрофон"}>
        {micEnabled ? "🎤" : "🔇"}
      </button>

      {/* Камера */}
      <button onClick={toggleCam}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition-colors ${
          camEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        title={camEnabled ? "Выключить камеру" : "Включить камеру"}>
        {camEnabled ? "📹" : "📷"}
      </button>

      {/* Фон (блюр) */}
      <button onClick={() => { setBgBlur(!bgBlur); toast.info(bgBlur ? "Блюр фона выключен" : "Блюр фона включён"); }}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
          bgBlur ? "bg-primary/30 text-primary" : "bg-white/10 hover:bg-white/20 text-muted-foreground"
        }`}
        title="Размытие фона">
        BG
      </button>

      {/* Полный экран */}
      <button onClick={onFullscreen}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20 transition-colors"
        title={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}>
        {isFullscreen ? "⛶" : "⛶"}
      </button>

      {/* Запись (только для практика) */}
      {role === "practitioner" && (
        <button onClick={async () => {
          if (recording && egressId) {
            await fetch("/api/video/recording", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ egressId }),
            });
            setRecording(false);
            setEgressId(null);
            toast.success("Запись остановлена. Файл будет доступен 24 часа.");
          } else {
            const res = await fetch("/api/video/recording", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bookingId }),
            });
            const d = await res.json();
            if (d.ok) {
              setRecording(true);
              setEgressId(d.egressId);
              toast.success("Запись начата");
            } else {
              toast.error(d.error ?? "Egress сервер недоступен");
            }
          }
        }}
          className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
            recording
              ? "bg-red-500/80 text-white animate-pulse hover:bg-red-500"
              : "bg-white/10 text-muted-foreground hover:bg-white/20"
          }`}
          title={recording ? "Остановить запись" : "Начать запись"}>
          {recording ? "⏹ Стоп" : "⏺ Запись"}
        </button>
      )}

      {/* AI Резюме (только для практика) */}
      {role === "practitioner" && (
        <button onClick={handleSummarize} disabled={summarizing}
          className="flex h-10 items-center gap-1.5 rounded-full bg-primary/20 px-4 text-xs font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
          title="Создать AI резюме сессии">
          {summarizing ? "..." : "✦ Резюме"}
        </button>
      )}

      {/* Разделитель */}
      <div className="h-8 w-px bg-white/10 mx-1" />

      {/* Завершить */}
      <button onClick={handleLeave} disabled={leaving}
        className="flex h-10 items-center gap-2 rounded-full bg-red-500/80 px-5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50">
        {leaving ? "..." : "Завершить"}
      </button>
    </div>
  );
}
