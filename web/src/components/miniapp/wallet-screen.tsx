"use client";

// B554 п.11: экран «Кошелёк» состоял из двух заглушечных строк — «Текущий
// баланс: баллы видны в верхней панели» (дублировало шапку и профиль) и ссылки
// на пакеты. Он не отвечал ни на один вопрос, ради которого туда заходят:
// сколько у меня баллов, откуда они, когда сгорают и на что ушли. Данные берём
// из того же `getCreditWalletSnapshot`, что и веб-кабинет.

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Coins, Clock, Receipt, StarFour } from "@phosphor-icons/react";
import { MiniAppChrome, useMiniAppV21 } from "@/components/miniapp/miniapp-shell";
import { styles } from "@/components/miniapp/styles";
import { pluralRu } from "@/lib/streak-display";

const HISTORY_PAGE_SIZE = 6;

export type WalletBreakdownRow = {
  key: string;
  label: string;
  pointTypeLabel: string;
  amount: number;
  expiryLabel: string;
};

export type WalletHistoryRow = {
  id: string;
  amount: number;
  balanceAfter: number | null;
  typeLabel: string;
  sourceLabel: string;
  dateLabel: string;
};

export function MiniAppWalletScreen({ balance, breakdown, history, nearestExpiry }: {
  balance: number;
  breakdown: WalletBreakdownRow[];
  history: WalletHistoryRow[];
  nearestExpiry: { amount: number; label: string } | null;
}) {
  const { data } = useMiniAppV21();
  const [visible, setVisible] = useState(HISTORY_PAGE_SIZE);

  if (!data.viewer.authenticated) {
    return (
      <MiniAppChrome data={data}>
        <div className={styles.subpage}>
          <Head />
          <Link className={styles["journey-primary"]} href="/miniapp/account?mode=login&intent=settings&returnTo=%2Fminiapp%2Fprofile%2Fwallet">Войти в аккаунт<ArrowRight size={18} /></Link>
        </div>
      </MiniAppChrome>
    );
  }

  return (
    <MiniAppChrome data={data}>
      <div className={styles.subpage} data-testid="miniapp-wallet">
        <Head />

        <section className={styles["wallet-balance"]}>
          <Coins size={26} weight="fill" />
          <div>
            <strong>{balance} {pluralRu(balance, ["балл", "балла", "баллов"])}</strong>
            <p>{nearestExpiry
              ? `${nearestExpiry.amount} ${pluralRu(nearestExpiry.amount, ["балл", "балла", "баллов"])} — ${nearestExpiry.label}`
              : "Срок действия — 12 месяцев с покупки"}</p>
          </div>
        </section>

        {breakdown.length ? (
          <section className={styles["wallet-block"]}>
            <p className={styles.eyebrow}>откуда баллы</p>
            <div className={styles["wallet-rows"]}>
              {breakdown.map((row) => (
                <div key={row.key}>
                  <span><Clock size={17} /></span>
                  <span><strong>{row.label}</strong><small>{row.pointTypeLabel} · {row.expiryLabel}</small></span>
                  <b>+{row.amount}</b>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles["wallet-block"]}>
          <p className={styles.eyebrow}>движение баллов</p>
          {history.length ? (
            <>
              <div className={styles["wallet-rows"]}>
                {history.slice(0, visible).map((row) => (
                  <div key={row.id}>
                    <span><Receipt size={17} /></span>
                    <span><strong>{row.typeLabel}</strong><small>{row.sourceLabel} · {row.dateLabel}</small></span>
                    <b className={row.amount < 0 ? styles["is-spend"] : undefined}>{row.amount > 0 ? `+${row.amount}` : row.amount}</b>
                  </div>
                ))}
              </div>
              {history.length > visible ? (
                <button className={styles["diary-more"]} type="button" onClick={() => setVisible((current) => current + HISTORY_PAGE_SIZE)}>
                  Показать ещё ({history.length - visible})
                </button>
              ) : null}
            </>
          ) : (
            <p className={styles["flow-note"]}><Receipt size={16} />Списаний и начислений пока не было.</p>
          )}
        </section>

        <Link className={styles["journey-primary"]} href="/miniapp/packages?tab=credits">Купить баллы<ArrowRight size={18} /></Link>
        <Link className={styles["journey-secondary"]} href="/miniapp/services"><StarFour size={17} />На что потратить</Link>
      </div>
    </MiniAppChrome>
  );
}

function Head() {
  return (
    <header className={styles["subpage-head"]}>
      <div className={styles["subpage-title-row"]}>
        <Link href="/miniapp/profile" className={styles["subpage-back"]} aria-label="Назад"><ArrowRight size={21} style={{ transform: "rotate(180deg)" }} /></Link>
        <div><p className={styles.eyebrow}>баллы</p><h1>Кошелёк</h1></div>
      </div>
      <p>Баллами открываются цифровые разборы и диалог в чате. Здесь видно, откуда они пришли и когда истекают.</p>
    </header>
  );
}
