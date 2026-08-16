/**
 * B711 · Разметка `@graph` для страниц, у которых нет записи в `publicPageSeo`.
 *
 * `PublicJsonLd` умеет только маршруты из `publicSeoRoutes` — список
 * фиксированный, а ячеек сетки сто двадцать. Общее здесь одно и важное:
 * `<` экранируется. Без этого строка внутри JSON, начинающаяся с `</script`,
 * закрывает тег и превращает разметку в исполняемый HTML.
 */
export function JsonLdGraph({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
