"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChatCircle,
  ChatCircleDots,
  Compass,
  Heart,
  IdentificationCard,
  Moon,
  ShareNetwork,
  StarFour,
  User,
  Users,
  type Icon,
} from "@phosphor-icons/react";
import { MINIAPP_SERVICES } from "@/lib/miniapp/catalog";
import type { MiniAppPractitionerCard } from "@/lib/miniapp/journey-data";
import type { MiniAppService } from "@/lib/miniapp/types";
import { MINIAPP_DIRECTIONS, matchesDirection, type MiniAppDirection } from "@/lib/miniapp/practitioner-filter";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { GlassSegmented } from "@/components/miniapp/glass-segmented";
import { PractitionerAvatar } from "@/components/miniapp/subpage-ui";
import { miniAppClass as c, styles } from "@/components/miniapp/styles";

type Format = "all" | "digital" | "specialist";

const SERVICE_ICONS: Record<string, Icon> = {
  primary: ChatCircleDots,
  reframe: Compass,
  "deep-report": IdentificationCard,
  "chat-analysis": ChatCircle,
  pair: Users,
  tarot: StarFour,
  "natal-chart": Moon,
  synastry: Heart,
  horary: Compass,
  "tarot-numerology": StarFour,
  numerology: IdentificationCard,
  "human-design": User,
  "surname-story": BookOpen,
  "chat-session": ChatCircle,
  specialist: User,
};

// «Самостоятельно» / «Со специалистом» не помещались в треть 344-пиксельной
// строки и обрезались — на это владелец жаловался отдельным пунктом round 4.
const FORMAT_OPTIONS = [
  { id: "all", label: "Все" },
  { id: "digital", label: "Разборы" },
  { id: "specialist", label: "Специалисты" },
] as const;

/**
 * B558: компактная карточка услуги.
 *
 * Прежняя занимала ~140px: крупная иконка-плитка слева, заголовок, описание,
 * цена и стрелка — четыре колонки на 344px. Владелец попросил ужать: цена ушла
 * в правый верхний угол, иконка встала в строку с заголовком, колонка со
 * стрелкой убрана. Осталось две строки текста вместо четырёх зон.
 */
function ServiceCard({ service }: { service: MiniAppService }) {
  const { openService, share } = useMiniAppV21();
  const ServiceIcon = SERVICE_ICONS[service.id] ?? StarFour;
  return (
    <article className={styles["service-row"]}>
      <button type="button" onClick={() => openService(service)}>
        <span className={styles["service-row-head"]}>
          <span className={styles["service-row-title"]}>
            <ServiceIcon size={16} weight="duotone" />
            <strong>{service.title}</strong>
          </span>
          <b className={styles["service-row-price"]}>{service.price}</b>
        </span>
        <p>{service.description}</p>
        {service.priceMeta ? <small>{service.priceMeta}</small> : null}
      </button>
      {service.shareable ? (
        <button
          className={styles["service-row-share"]}
          type="button"
          aria-label={`Поделиться: ${service.title}`}
          onClick={() => share(service.title, service.href)}
        >
          <ShareNetwork size={16} />
        </button>
      ) : null}
    </article>
  );
}

function PractitionerRow({ practitioner }: { practitioner: MiniAppPractitionerCard }) {
  return (
    <Link className={styles["service-row"]} href={`/miniapp/practitioners/${practitioner.slug}`}>
      <span className={styles["service-row-person"]}>
        {/* B572: `size` у PractitionerAvatar — intrinsic-атрибуты картинки, а не
            размер бокса: его задаёт класс .practitioner-avatar (52px). Число
            должно совпадать с классом, иначе next/image отдаёт картинку не под
            тот бокс, а вёрстка считает дорожку не по тому размеру. */}
        <PractitionerAvatar practitioner={practitioner} size={52} />
        <span>
          <span className={styles["service-row-head"]}>
            <strong>{practitioner.name}</strong>
            <b className={styles["service-row-price"]}>{practitioner.priceRub.toLocaleString("ru-RU")} ₽</b>
          </span>
          <p>{practitioner.title}</p>
          <small>{practitioner.durationMin} минут · {practitioner.verified ? "проверенный профиль" : "активный профиль"}</small>
        </span>
      </span>
    </Link>
  );
}

export function ServicesScreen({ practitioners }: { practitioners: MiniAppPractitionerCard[] }) {
  const { data, share } = useMiniAppV21();
  const [approach, setApproach] = useState<MiniAppDirection>("all");
  const [format, setFormat] = useState<Format>("all");

  // B558: один список на всю страницу. Раньше услуги были разбиты на пять
  // именованных групп, а над ними висели постоянные кнопки «Специалисты» и
  // «Библиотека», которые фильтр не трогал: владелец на них и указал —
  // кнопка «Библиотека» дублировала блок «Библиотека вопросов» ниже.
  const services = useMemo(() => MINIAPP_SERVICES.filter((service) => {
    if (service.format === "specialist") return false; // живые специалисты — своим блоком ниже
    if (format === "specialist") return false;
    if (approach === "all") return true;
    return service.approach === (approach === "esoteric" ? "symbolic" : "psychology");
  }), [approach, format]);

  const visiblePractitioners = useMemo(
    () => (format === "digital" ? [] : practitioners.filter((item) => matchesDirection(approach, item))),
    [approach, format, practitioners],
  );

  const nothing = services.length === 0 && visiblePractitioners.length === 0;

  return (
    <MiniAppChrome data={data}>
      <div className={styles["services-screen"]} data-screen="services" data-testid="miniapp-services-screen">
        <section className={styles["services-hero"]}>
          <div>
            <p className={styles.eyebrow}>один вопрос · разные способы</p>
            <h1>Выберите свой способ</h1>
            <p>Начните с вопроса или сразу откройте подходящий формат.</p>
          </div>
          <Image src="/miniapp/b474/service-orbit.png" alt="Абстрактная карта разных взглядов" width={416} height={470} priority />
        </section>

        <section className={styles["service-filter-panel"]} aria-label="Подбор услуг" data-testid="miniapp-service-filters">
          <GlassSegmented label="Подход" options={MINIAPP_DIRECTIONS} value={approach} onChange={(value) => setApproach(value as MiniAppDirection)} />
          <GlassSegmented label="Формат" options={FORMAT_OPTIONS} value={format} onChange={(value) => setFormat(value as Format)} />
        </section>

        {services.length ? (
          <section className={styles["catalog-section"]} data-group-id="services">
            <header><h2>Услуги</h2><p>Разборы, которые можно пройти самостоятельно</p></header>
            <div className={styles["service-rows"]}>
              {services.map((service) => <ServiceCard key={service.id} service={service} />)}
            </div>
          </section>
        ) : null}

        {visiblePractitioners.length ? (
          <section className={styles["catalog-section"]} data-group-id="practitioners">
            <header>
              <h2>Живые специалисты</h2>
              <p>Цена и длительность видны до записи</p>
            </header>
            <div className={styles["service-rows"]}>
              {visiblePractitioners.map((item) => <PractitionerRow key={item.slug} practitioner={item} />)}
            </div>
            <Link className={styles["catalog-section-more"]} href="/miniapp/practitioners">
              Все специалисты <ArrowRight size={15} />
            </Link>
          </section>
        ) : null}

        {nothing ? (
          <section className={styles["empty-detail"]}>
            <Compass size={28} />
            <strong>В этом сочетании фильтров пусто</strong>
            <p>Верните «Все» в одном из переключателей.</p>
          </section>
        ) : null}

        {/* B558: «Библиотека вопросов» — единственный блок, который остаётся под
            списком независимо от фильтра: это не услуга, а чужой опыт рядом. */}
        <section className={styles["catalog-section"]} data-group-id="library">
          <header><h2>Библиотека вопросов</h2><p>Похожее уже обсуждали</p></header>
          <div className={styles["library-strip"]}>
            {data.libraryItems.map((entry) => (
              <article key={entry.slug} className={styles["library-question"]}>
                <small>{entry.topic}</small>
                <p>{entry.question}</p>
                <div>
                  <Link href={`/miniapp/library/${entry.slug}`}>Читать</Link>
                  <button type="button" aria-label={`Поделиться: ${entry.question}`} onClick={() => share(entry.question, `/miniapp/library/${entry.slug}`)}>
                    <ShareNetwork size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Link className={styles["catalog-section-more"]} href="/miniapp/library">
            Все вопросы <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </MiniAppChrome>
  );
}
