// Gives every script chunk the browser loads that is made only of installed
// packages' code its own directory, `vendor/` beside the site's other scripts.
//
// The documentation deploy sweeps everything it publishes for references to the
// project's private records. Code from an installed package (the diagram
// renderer and the libraries it loads, for instance) is written elsewhere and
// cannot carry such a reference, while its minified text holds short tokens the
// sweep reads as one. So the deploy leaves this directory out of that sweep,
// and the directory has to hold nothing but installed code: a chunk is placed
// here only when every module bundled into it was resolved from a
// `node_modules` directory. A chunk mixing in any of the site's own modules, and
// every entry script a page names, stays beside the other scripts and is swept.
//
// The deploy's content gate names this directory; the two change together.
const VENDOR = "vendor";

function isInstalled(chunk) {
  const ids = chunk.moduleIds ?? [];
  return ids.length > 0 && ids.every((id) => id.split(/[\\/]/).includes("node_modules"));
}

/** A Vite plugin placing the browser build's installed-code chunks under `vendor/`. */
export default function installedChunks() {
  return {
    name: "aggrega-docs-installed-chunks",
    apply: "build",
    outputOptions(options) {
      if (this.environment?.name !== "client") return null;
      const named = options.chunkFileNames ?? "[name]-[hash].js";
      return {
        ...options,
        chunkFileNames(chunk) {
          const file = typeof named === "function" ? named(chunk) : named;
          if (!isInstalled(chunk)) return file;
          const slash = file.lastIndexOf("/");
          return `${file.slice(0, slash + 1)}${VENDOR}/${file.slice(slash + 1)}`;
        },
      };
    },
  };
}
