# Vendored packages

The documentation site builds from this repository and the brand package beside
it, so a dependency that is not on a package registry is carried here as the
archive `npm pack` makes, and `package.json` depends on it by a
`file:vendor/<archive>` path.

| Archive | Package | Packed from |
| --- | --- | --- |
| `cognitio-a11y-1.0.1.tgz` | `@cognitio/a11y` 1.0.1, the accessibility panel | the `site-modules` repository at tag `a11y-v1.0.1`, commit `ffc0542e720b8a1b46b515dbd2bb0c789caa7065`; sha256 `e6a4d865404a77dfe499c4cfa6bc26d8dc796e8b814260b17f2553afe327d91f` |

## Replacing a site-modules archive

A `site-modules` package is released by a tag, `<module>-v<version>`, and its
published archive is the one `npm pack` makes from that tag's
`packages/<module>/` directory. So it is packed from the tag, with no
credential:

1. Extract the tag's package into an empty directory outside any checkout:
   `git -C <site-modules checkout> archive <module>-v<version> packages/<module> | tar -x -C <dir>`.
2. In `<dir>/packages/<module>`, run
   `npm pack --ignore-scripts --pack-destination <this directory>`.
3. Delete the previous version's archive, and update the `file:vendor/…` path in
   `package.json`.
4. Run `npm install`, so `package-lock.json` records the archive's integrity,
   then `npm run build`.
5. Update the table above with the tag, its commit and the archive's sha256
   (`sha256sum <archive>`).

The home site and the catalog carry the same archive of `@cognitio/a11y`: the
three sites share one origin and the panel's settings, so they move to a new
version together.
