"use client";

import { useState } from "react";
import { Room, LocalParticipant } from "livekit-client";
import { toast } from "sonner";
import {
  Volume2,
  VolumeX,
  Volume1,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  Eye,
  StopCircle,
  Circle,
  Sparkles,
  LogOut,
} from "lucide-react";

interface VideoControlsProps {
  room: Room;
  localParticipant: LocalParticipant;
  onLeave: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  role: "client" | "practitioner";
  videoSessionId: string | null;
  bookingId: string;
  bgBlur: boolean;
  onBgBlurChange: () => void;
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
  bgBlur,
  onBgBlurChange,
}: VideoControlsProps) {
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [volume, setVolume] = useState(100);
  const [showVolume, setShowVolume] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
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
        toast.success("Резюме сессии готово", {
          description: d.clientFollowupDraft ? "Черновик для клиента и заметки практика сохранены" : "Доступно в кабинете практика",
        });
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
    <div className="flex items-center justify-center gap-3 px-6 py-3 bg-video-surface border-t border-white/10">
      {/* Громкость */}
      <div className="relative">
        <button
          onClick={() => setShowVolume(!showVolume)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Громкость"
          title="Громкость"
        >
          {volume === 0 ? <VolumeX className="h-5 w-5" /> : volume < 50 ? <Volume1 className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        {showVolume && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-video-surface border border-white/20 rounded-xl p-3 shadow-xl">
            <input type="range" min={0} max={100} value={volume}
              onChange={(e) => handleVolume(Number(e.target.value))}
              className="w-24 accent-primary" />
            <p className="text-xs text-center text-muted-foreground mt-1">{volume}%</p>
          </div>
        )}
      </div>

      {/* Микрофон */}
      <button
        onClick={toggleMic}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          micEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        aria-label={micEnabled ? "Выключить микрофон" : "Включить микрофон"}
        title={micEnabled ? "Выключить микрофон" : "Включить микрофон"}
      >
        {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      {/* Камера */}
      <button
        onClick={toggleCam}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          camEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        aria-label={camEnabled ? "Выключить камеру" : "Включить камеру"}
        title={camEnabled ? "Выключить камеру" : "Включить камеру"}
      >
        {camEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>

      {/* Фон (блюр) */}
      <button
        onClick={() => { onBgBlurChange(); toast.info(bgBlur ? "Блюр фона выключен" : "Блюр фона включён"); }}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          bgBlur ? "bg-primary/30 text-primary" : "bg-white/10 hover:bg-white/20 text-muted-foreground"
        }`}
        aria-label="Размытие фона"
        title="Размытие фона"
      >
        <Eye className="h-5 w-5" />
      </button>

      {/* Полный экран */}
      <button
        onClick={onFullscreen}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
        title={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
      >
        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
      </button>

      {/* Запись (только для практика) */}
      {role === "practitioner" && (
        <button
          onClick={async () => {
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
          className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
            recording
              ? "bg-red-500/80 text-white animate-pulse hover:bg-red-500"
              : "bg-white/10 text-muted-foreground hover:bg-white/20"
          }`}
          aria-label={recording ? "Остановить запись" : "Начать запись"}
          title={recording ? "Остановить запись" : "Начать запись"}
        >
          {recording ? <StopCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          {recording ? "Стоп" : "Запись"}
        </button>
      )}

      {/* AI Резюме (только для практика) */}
      {role === "practitioner" && (
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary/20 px-4 text-xs font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
          aria-label="Создать AI резюме сессии"
          title="Создать AI резюме сессии"
        >
          <Sparkles className="h-4 w-4" />
          {summarizing ? "..." : "Резюме"}
        </button>
      )}

      {/* Разделитель */}
      <div className="h-8 w-px bg-white/10 mx-1" />

      {/* Завершить */}
      <button
        onClick={handleLeave}
        disabled={leaving}
        className="flex min-h-[44px] items-center gap-2 rounded-full bg-red-500/80 px-5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
        aria-label="Завершить сессию"
        title="Завершить сессию"
      >
        <LogOut className="h-4 w-4" />
        {leaving ? "..." : "Завершить"}
      </button>
    </div>
  );
}
