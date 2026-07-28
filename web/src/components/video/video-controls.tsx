"use client";

import { useState } from "react";
import { useMediaDeviceSelect, useTrackToggle } from "@livekit/components-react";
import { Room, Track } from "livekit-client";
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
  Sparkles,
  LogOut,
  MonitorUp,
  Settings2,
  LoaderCircle,
} from "lucide-react";

interface VideoControlsProps {
  room: Room;
  onLeave: () => Promise<boolean>;
  onFullscreen: () => void;
  isFullscreen: boolean;
  role: "client" | "practitioner";
  bgBlur: boolean;
  bgBlurBusy: boolean;
  onBgBlurChange: (enabled: boolean) => Promise<boolean>;
  onOpenAiPanel: () => void;
  aiCaptureActive: boolean;
}

export function VideoControls({
  room,
  onLeave,
  onFullscreen,
  isFullscreen,
  role,
  bgBlur,
  bgBlurBusy,
  onBgBlurChange,
  onOpenAiPanel,
  aiCaptureActive,
}: VideoControlsProps) {
  const [volume, setVolume] = useState(100);
  const [showVolume, setShowVolume] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [screenShareSupported] = useState(
    () => typeof navigator !== "undefined"
      && typeof navigator.mediaDevices?.getDisplayMedia === "function",
  );
  const [leaving, setLeaving] = useState(false);

  const mic = useTrackToggle({
    source: Track.Source.Microphone,
    room,
    onDeviceError: (error) => toast.error("Не удалось включить микрофон", { description: error.message }),
  });
  const camera = useTrackToggle({
    source: Track.Source.Camera,
    room,
    onDeviceError: (error) => toast.error("Не удалось включить камеру", { description: error.message }),
  });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    room,
    onDeviceError: (error) => toast.error("Не удалось показать экран", { description: error.message }),
  });

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

  async function handleLeave() {
    setLeaving(true);
    const left = await onLeave();
    if (!left) setLeaving(false);
  }

  return (
    // B554: на 390px ряд управления (~482px) не помещался в контент-колонку
    // (~352px), а родитель обрезан `overflow: hidden` — с краёв срезало
    // громкость и, что важнее, кнопку «Завершить». Клиент не мог выйти из
    // звонка. Разрешаем перенос на вторую строку вместо обрезки.
    <div
      className="relative flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-video-surface px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-6 sm:py-3"
      aria-label="Управление видеосессией"
    >
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
        {...mic.buttonProps}
        onClick={() => void mic.toggle()}
        disabled={mic.pending}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          mic.enabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        aria-label={mic.enabled ? "Выключить микрофон" : "Включить микрофон"}
        title={mic.enabled ? "Выключить микрофон" : "Включить микрофон"}
      >
        {mic.pending
          ? <LoaderCircle className="h-5 w-5 animate-spin" />
          : mic.enabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      {/* Камера */}
      <button
        {...camera.buttonProps}
        onClick={() => void camera.toggle()}
        disabled={camera.pending}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          camera.enabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"
        }`}
        aria-label={camera.enabled ? "Выключить камеру" : "Включить камеру"}
        title={camera.enabled ? "Выключить камеру" : "Включить камеру"}
      >
        {camera.pending
          ? <LoaderCircle className="h-5 w-5 animate-spin" />
          : camera.enabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>

      {/* Фон (блюр) */}
      <button
        onClick={async () => {
          const enabled = await onBgBlurChange(!bgBlur);
          if (enabled) toast.success(bgBlur ? "Размытие фона выключено" : "Размытие фона включено");
        }}
        disabled={bgBlurBusy || !camera.enabled}
        className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
          bgBlur ? "bg-primary/30 text-primary" : "bg-white/10 hover:bg-white/20 text-muted-foreground"
        } disabled:cursor-not-allowed disabled:opacity-45`}
        aria-label={bgBlur ? "Выключить размытие моего фона" : "Размыть мой фон"}
        title={bgBlur ? "Выключить размытие моего фона" : "Размыть мой фон"}
      >
        {bgBlurBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5" />}
      </button>

      {/* Демонстрация экрана */}
      {screenShareSupported && (
        <button
          {...screen.buttonProps}
          onClick={() => void screen.toggle()}
          disabled={screen.pending}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
            screen.enabled ? "bg-primary/30 text-primary" : "bg-white/10 hover:bg-white/20"
          }`}
          aria-label={screen.enabled ? "Остановить демонстрацию экрана" : "Показать экран"}
          title={screen.enabled ? "Остановить демонстрацию экрана" : "Показать экран"}
        >
          {screen.pending
            ? <LoaderCircle className="h-5 w-5 animate-spin" />
            : <MonitorUp className="h-5 w-5" />}
        </button>
      )}

      {/* Выбор камеры, микрофона и динамика */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDevices((current) => !current)}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
            showDevices ? "bg-primary/30 text-primary" : "bg-white/10 hover:bg-white/20"
          }`}
          aria-expanded={showDevices}
          aria-label="Выбрать камеру, микрофон и динамик"
          title="Устройства"
        >
          <Settings2 className="h-5 w-5" />
        </button>
        {showDevices && (
          <div className="absolute bottom-14 right-0 z-50 w-[min(21rem,calc(100vw-1rem))] space-y-3 rounded-2xl border border-white/15 bg-video-surface p-4 text-left shadow-2xl">
            <p className="text-sm font-semibold">Устройства</p>
            <DeviceSelect room={room} kind="audioinput" label="Микрофон" />
            <DeviceSelect room={room} kind="videoinput" label="Камера" />
            <DeviceSelect room={room} kind="audiooutput" label="Динамик" />
          </div>
        )}
      </div>

      {/* Полный экран */}
      <button
        onClick={onFullscreen}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
        title={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
      >
        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
      </button>

      {/* AI-конспект — рабочий инструмент практика, клиенту не показывается. */}
      {role === "practitioner" && !aiCaptureActive && (
        <button
          type="button"
          onClick={onOpenAiPanel}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary/20 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/30 sm:px-4"
          aria-label="Настроить AI-конспект сессии"
          title="AI-конспект сессии"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI-конспект</span>
        </button>
      )}

      {/* Разделитель */}
      <div className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />

      {/* Завершить */}
      <button
        onClick={handleLeave}
        disabled={leaving}
        className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-red-500/80 px-4 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50 sm:px-5"
        aria-label="Завершить сессию"
        title="Завершить сессию"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden min-[380px]:inline">{leaving ? "..." : "Завершить"}</span>
      </button>
    </div>
  );
}

function DeviceSelect({
  room,
  kind,
  label,
}: {
  room: Room;
  kind: MediaDeviceKind;
  label: string;
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    room,
    requestPermissions: false,
    onError: (error) => toast.error(`Не удалось выбрать: ${label.toLowerCase()}`, { description: error.message }),
  });

  return (
    <label className="block text-xs text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <select
        value={activeDeviceId}
        disabled={devices.length === 0}
        onChange={(event) => void setActiveMediaDevice(event.target.value)}
        className="min-h-[44px] w-full rounded-xl border border-white/15 bg-video-bg px-3 text-sm text-foreground outline-none focus:bg-white/10 disabled:opacity-50"
      >
        {devices.length === 0 && <option value="">Недоступно в этом браузере</option>}
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
