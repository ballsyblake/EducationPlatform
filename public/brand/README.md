# Brand assets

The Football Queensland logo files are **not** in this repository. Per the brand
guidelines (2.A), only official master artwork may be used, and it must never be
altered, re-drawn, re-created, or typeset from a font. Request the files from
the Football Queensland Marketing team — (07) 3208 2677.

Drop them in this folder and point the app at them:

```
NEXT_PUBLIC_FQ_LOGO="/brand/FQ_RGB_HORIZ_Maroon_Grad.svg"
NEXT_PUBLIC_FQ_LOGO_LIGHT="/brand/FQ_RGB_HORIZ_White_Solid.svg"
```

- `NEXT_PUBLIC_FQ_LOGO` — the full-colour version, used on the sign-in page,
  which sits on white. The master gradient logo is only permitted on white or
  on images.
- `NEXT_PUBLIC_FQ_LOGO_LIGHT` — the mono white version, used in the app header,
  which sits on Deep Maroon.

Until these are set, the app shows its own name in brand type rather than any
approximation of the logo.

Both are read at build time, as Next.js inlines `NEXT_PUBLIC_*` values — set
them before building, and rebuild after changing them.
