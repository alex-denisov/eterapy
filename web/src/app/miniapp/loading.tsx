// INC-078: граница загрузки живёт на сегменте, а не на корне — иначе Next
// фиксирует HTTP 200 до того, как страница успевает вызвать notFound().
// Подробности и причина именно этого набора сегментов — в RouteLoading.
export { RouteLoading as default } from "@/components/route-loading";
