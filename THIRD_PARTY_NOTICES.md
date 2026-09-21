# Geographic data

`src/data/earth.js` is generated from Natural Earth 4.1.0, 1:110m Admin 0 country
boundaries, redistributed by **world-atlas 2.0.2**. Natural Earth data is public domain.

- https://www.naturalearthdata.com/about/terms-of-use/
- https://github.com/topojson/world-atlas
- https://www.npmjs.com/package/world-atlas

Projection: Equal Earth, generated with d3-geo at build time. No mapping library is
loaded by the game at runtime. Boundaries are generalized and do not express a position
on territorial disputes. Neutral geographic features are not additional simulated nations.

world-atlas redistribution license (ISC):

Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

# Tutorial and sound

The local 30-second tutorial videos and posters are original recordings/compositions
of this game's UI, made by `tools/build-tutorial.mjs`. Their map imagery includes the
Natural Earth data credited above. They are silent, with English/Italian on-screen
captions and matching HTML transcripts. No third-party recordings or music samples
are included. The ambient score and SFX are synthesized by the game.
