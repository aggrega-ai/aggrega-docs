# Vendored packages

The documentation site builds from this repository and the brand package beside
it, so a dependency that is not on a package registry is carried here as the
archive `npm pack` makes, and `package.json` depends on it by a
`file:vendor/<archive>` path.

| Archive | Package | Packed from |
| --- | --- | --- |
| `cognitio-a11y-1.3.0.tgz` | `@cognitio/a11y` 1.3.0, the accessibility panel | the `site-modules` repository at tag `a11y-v1.3.0`, commit `3f3fd82962b0d6d871d979181d2d52b8f9628a29`; sha256 `cc164516908de946394dc9df93d339bc7815fcb7cf34a02507ad69e39eea88af` |
| `cognitio-languages-1.0.0.tgz` | `@cognitio/languages` 1.0.0, the reader of the project's declared languages | the `site-modules` repository at tag `languages-v1.0.0`, commit `604cf2e81f8d7f0bfe853a66870bf27df65178ad`; sha256 `283c027470cfb4dcc6b26660bf59a2d1d75b7e02718fd66c3fca2e4adf5be5ec` |

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
