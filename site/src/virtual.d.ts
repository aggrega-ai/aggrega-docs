// The module the site configuration provides (see untranslatedPagesModule in
// src/translations.mjs): the routes of the translated pages that still hold
// English text.
declare module "virtual:aggrega-docs/untranslated-pages" {
  const routes: string[];
  export default routes;
}

// The module the site configuration provides (see machineTranslationNoticeModule
// in src/translations.mjs): each published language's machine-translation
// notice, by the language's path segment.
declare module "virtual:aggrega-docs/machine-translation-notice" {
  const notices: Record<
    string,
    { tree: string; lang: string; before: string; link: string; after: string }
  >;
  export default notices;
}
