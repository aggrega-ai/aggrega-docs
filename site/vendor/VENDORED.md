# Vendored packages

The documentation site builds from this repository and the brand package beside
it, so a dependency that is not on a package registry is carried here as the
archive `npm pack` makes, and `package.json` depends on it by a
`file:vendor/<archive>` path.

| Archive | Package | Packed from |
| --- | --- | --- |
| `cognitio-a11y-1.0.0.tgz` | `@cognitio/a11y` 1.0.0, the accessibility panel | the `site-modules` repository at tag `a11y-v1.0.0`, commit `f23c0fa45243150fcf1ce0bc227f7a0f83effcca`; sha256 `1de4fd0b58d859bd9f7b90929165aba03eb8b7ebf16c613aa927686c251833e6` |

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
