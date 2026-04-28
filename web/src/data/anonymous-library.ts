export type AnonymousLibraryStatus = "approved" | "rejected" | "deleted";

export type AnonymousLibraryEntry = {
  slug: string;
  topic: string;
  question: string;
  summary: string;
  perspectives: string[];
  reactions: number;
  status: AnonymousLibraryStatus;
  indexable: boolean;
};

export const anonymousLibraryEntries: AnonymousLibraryEntry[] = [
  {
    slug: "ne-mogu-reshitsya-na-razgovor",
    topic: "Отношения",
    question: "Я давно откладываю важный разговор и боюсь, что испорчу отношения. Как понять, когда говорить?",
    summary: "Вопрос не только о моменте разговора, но и о границах: что именно нужно сказать, какой реакции вы опасаетесь и чего хотите сохранить.",
    perspectives: [
      "Сначала отделите факт разговора от страха последствий.",
      "Подготовьте одну главную мысль, а не полный список претензий.",
      "Если есть риск давления или угроз, выбирайте безопасный формат и поддержку.",
    ],
    reactions: 42,
    status: "approved",
    indexable: true,
  },
  {
    slug: "stoyu-pered-vyborom-raboty",
    topic: "Работа",
    question: "Есть стабильная работа и новая возможность, но я не понимаю, где мой настоящий шанс.",
    summary: "Выбор можно рассмотреть через энергию, риски, ресурсы и цену бездействия, не превращая его в обещание судьбы.",
    perspectives: [
      "Сравните не только доход, но и темп, людей и восстановление.",
      "Проверьте, что именно вы называете стабильностью.",
      "Сформулируйте минимальный безопасный эксперимент на 2 недели.",
    ],
    reactions: 31,
    status: "approved",
    indexable: true,
  },
  {
    slug: "povtoryaetsya-odin-i-tot-zhe-scenariy",
    topic: "Паттерны",
    question: "Почему я снова оказываюсь в похожей ситуации, хотя каждый раз выбираю по-другому?",
    summary: "Повтор может быть не в событии, а в критериях выбора, привычной роли или моменте, где вы перестаете замечать свои границы.",
    perspectives: [
      "Опишите последние три похожие ситуации одной схемой.",
      "Отметьте момент, где вы впервые почувствовали напряжение.",
      "Ищите повторяющийся выбор, а не виновника.",
    ],
    reactions: 58,
    status: "approved",
    indexable: true,
  },
  {
    slug: "deleted-private-case",
    topic: "Приватность",
    question: "Удаленный вопрос не должен индексироваться.",
    summary: "Удалено по запросу автора.",
    perspectives: [],
    reactions: 0,
    status: "deleted",
    indexable: false,
  },
];

export function approvedLibraryEntries() {
  return anonymousLibraryEntries.filter((entry) => entry.status === "approved" && entry.indexable);
}

export function libraryTopics() {
  return Array.from(new Set(approvedLibraryEntries().map((entry) => entry.topic))).sort((a, b) => a.localeCompare(b, "ru"));
}

export function getApprovedLibraryEntry(slug: string) {
  return approvedLibraryEntries().find((entry) => entry.slug === slug);
}
