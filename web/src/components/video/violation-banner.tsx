"use client";

interface ViolationBannerProps {
  message: string;
  onClose: () => void;
}

export function ViolationBanner({ message, onClose }: ViolationBannerProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-50 flex items-start justify-between gap-3 bg-red-900/95 px-4 py-3 shadow-xl backdrop-blur-sm border-b border-red-500/40">
      <div className="flex items-start gap-3 flex-1">
        <span className="text-xl shrink-0 mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-white">Предупреждение ETerapy</p>
          <p className="text-xs text-red-200 mt-0.5 leading-relaxed">{message}</p>
          <p className="text-xs text-red-300/70 mt-1">
            Пожалуйста, убедитесь что консультация соответствует этическому кодексу платформы.
            При нарушениях вы можете завершить сессию или обратиться в поддержку.
          </p>
        </div>
      </div>
      <button onClick={onClose}
        className="shrink-0 mt-0.5 rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
        title="Закрыть предупреждение">
        ✕
      </button>
    </div>
  );
}
