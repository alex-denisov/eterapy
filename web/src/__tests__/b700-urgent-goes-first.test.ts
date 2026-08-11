/**
 * B700 фаза 8 — срочное вперёд: ключ очереди это срок до окна, а не факт
 * написания.
 *
 * ЧТО БЫЛО. Фаза 1 ставила написанное впереди ненаписанного, и внутри каждой
 * группы сортировала по сроку. Проход берёт не больше `LOOP_LIMIT` = 3
 * материалов, поэтому три НЕсрочных написанных материала занимали проход
 * целиком, а материал, чьё окно сегодня, не начинали вовсе. Порядок был
 * «сначала дешёвое», а не «сначала горящее» — при том что пропущенное окно
 * стоит слота, а отложенный склад не стоит ничего, кроме ожидания.
 *
 * ТРЕБОВАНИЕ ВЛАДЕЛЬЦА (2026-08-09, дословно): «контент который редактируется,
 * и должен быть выпущен в соответствии со своим временным окном, должен
 * проходить модерацию редактором в приоритете, потому что его выпуск (если он
 * уже в ближайшее время) должен обязательно состояться».
 *
 * ЧТО СТАЛО. Одна очередь по сроку; при РАВНОМ сроке вперёд идёт написанное —
 * его остаток дешевле (один вызов редактора против двух вызовов полного цикла).
 */
import { orderByUrgency } from "@/lib/marketing/conveyor-tact";

const at = (iso: string) => new Date(iso);

describe("B700 фаза 8 · очередь конвейера по сроку выпуска", () => {
  it("горящее ненаписанное обгоняет несрочное написанное", () => {
    const order = orderByUrgency([
      { id: "written-tomorrow", scheduledFor: at("2026-08-12T09:00:00Z"), written: true },
      { id: "fresh-today", scheduledFor: at("2026-08-11T09:00:00Z"), written: false },
    ]).map((row) => row.id);
    expect(order).toEqual(["fresh-today", "written-tomorrow"]);
  });

  it("при равном сроке написанное идёт первым: его остаток дешевле", () => {
    const order = orderByUrgency([
      { id: "fresh", scheduledFor: at("2026-08-11T09:00:00Z"), written: false },
      { id: "written", scheduledFor: at("2026-08-11T09:00:00Z"), written: true },
    ]).map((row) => row.id);
    expect(order).toEqual(["written", "fresh"]);
  });

  it("проход из трёх мест достаётся горящим, а не всему складу", () => {
    // Ровно тот случай, ради которого правка: склад полон несрочного, а окно
    // одного материала — сегодня.
    const planned = orderByUrgency([
      { id: "sklad-1", scheduledFor: at("2026-08-13T09:00:00Z"), written: true },
      { id: "sklad-2", scheduledFor: at("2026-08-13T12:00:00Z"), written: true },
      { id: "sklad-3", scheduledFor: at("2026-08-13T18:00:00Z"), written: true },
      { id: "gorit", scheduledFor: at("2026-08-11T08:30:00Z"), written: false },
    ]).slice(0, 3).map((row) => row.id);
    expect(planned).toContain("gorit");
    expect(planned[0]).toBe("gorit");
    expect(planned).not.toContain("sklad-3");
  });

  it("строка без срока идёт последней, а не впереди материала с окном", () => {
    const order = orderByUrgency([
      { id: "bez-sroka", scheduledFor: null, written: true },
      { id: "s-oknom", scheduledFor: at("2026-08-11T20:30:00Z"), written: false },
    ]).map((row) => row.id);
    expect(order).toEqual(["s-oknom", "bez-sroka"]);
  });

  it("порядок устойчив: одинаковые срок и стадия разбираются по id", () => {
    const rows = [
      { id: "b", scheduledFor: at("2026-08-11T09:00:00Z"), written: true },
      { id: "a", scheduledFor: at("2026-08-11T09:00:00Z"), written: true },
    ];
    expect(orderByUrgency(rows).map((row) => row.id)).toEqual(["a", "b"]);
    expect(orderByUrgency([...rows].reverse()).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("исходный массив не мутируется", () => {
    const rows = [
      { id: "late", scheduledFor: at("2026-08-13T09:00:00Z"), written: true },
      { id: "early", scheduledFor: at("2026-08-11T09:00:00Z"), written: false },
    ];
    orderByUrgency(rows);
    expect(rows.map((row) => row.id)).toEqual(["late", "early"]);
  });
});
