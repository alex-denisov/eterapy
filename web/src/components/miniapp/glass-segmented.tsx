"use client";

import { styles } from "@/components/miniapp/styles";

export type SegmentOption = { id: string; label: string };

/**
 * B558: сегментный переключатель в духе iOS-«жидкого стекла».
 *
 * От обычных вкладок его отличают три вещи, и все три — материал, а не цвет:
 * дорожка размывает то, что под ней (`backdrop-filter`), у неё есть световая
 * кромка сверху, а выбранный сегмент — отдельная «линза», которая едет по
 * дорожке и отбрасывает тень. Ширина сегментов равная, весь контрол занимает
 * всю доступную ширину: владелец отдельно просил не оставлять пустоту справа.
 *
 * Один компонент на «Услуги» и «Живые специалисты» — иначе метки и стиль
 * снова разъедутся, как разъехались «Практики» и «Эзотерика».
 */
export function GlassSegmented({ label, options, value, onChange }: {
  label: string;
  options: readonly SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  return (
    <div
      className={styles["glass-segmented"]}
      role="group"
      aria-label={label}
      style={{ "--segments": options.length, "--active": index } as React.CSSProperties}
    >
      <span className={styles["glass-thumb"]} aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          className={option.id === value ? styles["is-active"] : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
