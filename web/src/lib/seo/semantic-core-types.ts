// B608 — типы семантического ядра.
//
// Ядро собрано по услугам: на каждую услугу отдельный замер Wordstat по
// нескольким входным фразам, дедуп, порог 100 показов в месяц и потолок
// 150 фраз. Фраза без замера в ядро не попадает по построению — прочерков
// в графе спроса не бывает.
export type SemanticIntent = "информационный" | "коммерческий" | "смешанный";

export type SemanticPhrase = {
  phrase: string;
  /** Показов в месяц, Россия, broad match. Замер Wordstat 27.07.2026. */
  demand: number;
  priority: "P1" | "P2";
  intent: SemanticIntent;
};

export type SemanticCluster = {
  /** Ключ услуги (V5ProductSlug) либо посадочной, если услуги нет. */
  service: string;
  serviceName?: string;
  name: string;
  cluster: string;
  landing: string;
  phrases: readonly SemanticPhrase[];
};

export type SemanticCoreRow = SemanticPhrase & {
  service: string;
  serviceName: string;
  cluster: string;
  landing: string;
};
