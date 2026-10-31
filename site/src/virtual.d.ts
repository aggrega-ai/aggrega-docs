// The module the site configuration provides (see untranslatedPagesModule in
// src/translations.mjs): the routes of the translated pages that still hold
// English text.
declare module "virtual:aggrega-docs/untranslated-pages" {
  const routes: string[];
  export default routes;
}
