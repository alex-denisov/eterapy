import { notFound } from "next/navigation";

// B385: the standalone «Круг» product is closed. Its multi-participant
// mechanic now powers the «Взгляд со стороны» scenario inside «Вместе»
// (/products/pair). The old route 404s; no redirect by M26 policy.
export default function CirclePage() {
  notFound();
}
