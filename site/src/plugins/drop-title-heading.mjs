// Leaves a page's title heading out of its rendered body.
//
// A page's title is its first level-one heading: the content collection reads
// it there (src/content.config.ts), and Starlight renders the title above the
// body on its own. The same heading left in the body would show the title a
// second time, so the rendered body starts after it. The corpus keeps the
// heading: wherever the Markdown is read as written — on GitHub, in
// llms-full.txt and through the documentation bundle — it is the page's title.
//
// The heading removed is the first level-one heading at the top level of the
// page, the one the collection takes the title from.

export default function dropTitleHeading() {
  return function transformer(tree) {
    const index = tree.children.findIndex((node) => node.type === "heading" && node.depth === 1);
    if (index >= 0) tree.children.splice(index, 1);
  };
}
