// B466 R9-5 — единый список часовых поясов для выпадающих списков (Настройки:
// «Тихие часы» и «Интерфейс»). IANA-идентификатор + человекочитаемая подпись с
// GMT-смещением. Покрывает часовые пояса России от Калининграда до Камчатки.
export interface TimezoneOption {
  value: string;
  label: string;
}

export const RU_TIMEZONES: TimezoneOption[] = [
  { value: "Europe/Kaliningrad", label: "Калининград · GMT+2" },
  { value: "Europe/Moscow", label: "Москва · GMT+3" },
  { value: "Europe/Samara", label: "Самара · GMT+4" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург · GMT+5" },
  { value: "Asia/Omsk", label: "Омск · GMT+6" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск · GMT+7" },
  { value: "Asia/Irkutsk", label: "Иркутск · GMT+8" },
  { value: "Asia/Yakutsk", label: "Якутск · GMT+9" },
  { value: "Asia/Vladivostok", label: "Владивосток · GMT+10" },
  { value: "Asia/Magadan", label: "Магадан · GMT+11" },
  { value: "Asia/Kamchatka", label: "Камчатка · GMT+12" },
];

export const DEFAULT_TIMEZONE = "Europe/Moscow";

export function timezoneLabel(value: string): string {
  return RU_TIMEZONES.find((t) => t.value === value)?.label ?? value;
}
