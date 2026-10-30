# Bundled interface fonts

These unmodified WOFF2 binaries preserve the existing interface font families
and normal weights 400, 500, 600, and 700. CSS uses relative asset URLs so Next.js
emits them into `.next/static/media`, which the Electron package already includes.
No font request to Google or another external host is needed at runtime or build.

- **IBM Plex Sans TC:** complete hinted WOFF2 files from IBM's official
  `@ibm/plex-sans-tc@1.1.1` npm release. Upstream: https://github.com/IBM/plex.
  Archive: https://registry.npmjs.org/@ibm/plex-sans-tc/-/plex-sans-tc-1.1.1.tgz.
  Verified SHA-512 (base64):
  `pM4DfRkKL4Vqrew/GDrqfXe1sqAcLuYR49Xks0yCAVQHhoMna0yJ5sV3KfC542h455oAK3XrH9CtSd0sfq+u9Q==`.
- **Chakra Petch:** original WOFF2 subsets and Unicode ranges from
  `@fontsource/chakra-petch@5.3.0`. Upstream:
  https://github.com/fontsource/font-files/tree/main/fonts/google/chakra-petch.
  Archive: https://registry.npmjs.org/@fontsource/chakra-petch/-/chakra-petch-5.3.0.tgz.
  Verified SHA-512 (base64):
  `QZvbM/q2R6n1pg2x+TJPftZmBNS+ADU37L4Z4L/6UJIz+JZ/SRaEf8usPFRiP7Ht28sIideMu/Bm1SnGlSrwNw==`.

Both fonts use SIL Open Font License 1.1. Full upstream license and copyright
notices are retained in `electron/licenses/` so the existing `electron/**/*`
packaging rule includes them in `app.asar`. Only font assets are vendored; no
upstream package installation scripts are executed.
