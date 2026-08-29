# Third-party notices

`potree-lib` is a port of **Potree 1.8** and its published build (`dist/`)
redistributes, in bundled and/or modified form, source code from Potree, from
libraries Potree itself vendored, and from a number of npm packages that the
loader subpaths depend on. Their license terms and copyright notices are
reproduced below.

Sections:

1. [Potree](#potree)
2. [Code vendored into the source tree](#code-vendored-into-the-source-tree)
3. [npm dependencies bundled into `dist/`](#npm-dependencies-bundled-into-dist)
4. [Peer dependency (not redistributed)](#peer-dependency-not-redistributed)

---

## Potree

The overwhelming majority of `src/` is ported from Potree 1.8.

- Project: https://github.com/potree/potree — http://potree.org
- Copyright (c) 2011-2020, Markus Schütz
- License: BSD 2-Clause (see [`LICENSE`](./LICENSE))

Individual Potree modules additionally credit: `DXFExporter` / `GeoJSONExporter`
— sigeom sa (http://sigeom.ch), Ioda-Net Sàrl (https://www.ioda-net.ch/);
`DXFProfileExporter` — roy.mdr. These are `@author` credits under Potree's own
BSD-2-Clause license, not separate grants.

---

## Code vendored into the source tree

Copied into `src/` (and therefore into `dist/`), each with its attribution
header kept in-file.

### plas.io / plasio — LAS/LAZ decoding

`src/loaders/las/laslaz.js` (adapted from `libs/plasio/js/laslaz.js` into an ES
module) and `src/workers/las/laz-perf.js` (the Emscripten `laz-perf` asm.js
build, vendored essentially unmodified — adds a trailing `export`).

```
The MIT License (MIT)

Copyright (c) 2014 Uday Verma, uday.karan@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

The decompressor inside that asm.js build is **laz-perf** by Hobu, Inc. and
contributors (https://github.com/hobuinc/laz-perf), Apache-2.0 — the same
project as the npm `laz-perf` package listed below; see that entry for the
Apache-2.0 text.

### Brotli decoder

`src/workers/octree2/brotli-decode.js` — pure-JS brotli decompression for the
octree 2.0 brotli-compressed node format.

```
Copyright 2017 Google Inc. All Rights Reserved.

Distributed under MIT license.
See https://opensource.org/licenses/MIT
```

### Binary heap

`src/loaders/BinaryHeap.js` — priority queue for the octree LOD traversal.

```
Binary Heap implementation in Javascript
From: http://eloquentjavascript.net/1st_edition/appendix2.html

Copyright (c) 2007 Marijn Haverbeke, last modified on November 28 2013.

Licensed under a Creative Commons attribution-noncommercial license.
All code in this book may also be considered licensed under an MIT license.
```

`potree-lib` relies on the MIT grant in the last line.

---

## npm dependencies bundled into `dist/`

The Vite library build inlines the following packages into the published
`dist/` bundles and worker files (list derived from the build's source maps).
Their license obligations therefore attach to this distribution.

| Package | Bundled into | License |
| --- | --- | --- |
| `@ngageoint/geopackage` | `dist/loaders/index.js` | MIT |
| `@tweenjs/tween.js` | `dist/…/TextSprite-*.js` (shared) | MIT |
| `copc` | `dist/loaders/index.js`, `dist/…/view-*.js`, `dist/workers/EptLaszipDecoderWorker.js` | MIT |
| `cross-fetch` | `dist/…/view-*.js` (shared) | MIT |
| `laz-perf` | `dist/…/view-*.js`, `dist/workers/EptLaszipDecoderWorker.js` (WASM inlined as a base64 `data:` URI) | Apache-2.0 |
| `proj4` | `dist/…/index-*.js` (shared) | MIT |
| `mgrs` | `dist/…/index-*.js` (via `proj4`) | MIT |
| `wkt-parser` | `dist/…/index-*.js` (via `proj4`) | MIT |
| `rtree-sql.js` | `dist/loaders/index.js` (via `@ngageoint/geopackage`) | MIT |
| `better-sqlite3` | referenced from `dist/loaders/index.js` via `@ngageoint/geopackage`'s optional native adapter — the SQL.js adapter is what actually runs in a browser | MIT |
| `shapefile` | `dist/loaders/index.js` | BSD-3-Clause |
| `array-source`, `path-source`, `slice-source`, `stream-source` | `dist/loaders/index.js` (via `shapefile`) | BSD-3-Clause |

A consuming app's bundler may additionally pull further transitive
dependencies of `@ngageoint/geopackage` (the `@turf/*` stack, `lodash`,
`wkx`, `reproject`, …) into its own build depending on which GeoPackage code
paths it exercises; those packages ship their own license files under
`node_modules/` and are predominantly MIT.

### MIT (bundled)

The following are all under the MIT License, whose terms are:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Copyright notices:

- `@ngageoint/geopackage` — Copyright (c) 2015 National Geospatial-Intelligence Agency
- `@tweenjs/tween.js` — Copyright (c) 2010-2012 Tween.js authors; easing equations Copyright (c) 2001 Robert Penner (http://robertpenner.com/easing/)
- `copc` — Copyright (c) 2021 Connor Manning
- `cross-fetch` — Copyright (c) 2017 Leonardo Quixadá
- `proj4` — Copyright (c) 2014, Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf
- `mgrs` — Copyright (c) 2012, Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral, Calvin Metcalf
- `wkt-parser` — Copyright (c) 2014, Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf
- `rtree-sql.js` — Copyright (c) 2017 sql.js authors (see the package's `AUTHORS`)
- `better-sqlite3` — Copyright (c) 2017 Joshua Wise

### BSD-3-Clause (bundled): `shapefile`, `array-source`, `path-source`, `slice-source`, `stream-source`

```
Copyright (c) 2013-2016, Michael Bostock
All rights reserved.
(array-source, path-source, stream-source: 2016; slice-source: 2016;
 shapefile: 2013-2016)

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* The name Michael Bostock may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Apache-2.0 (bundled): `laz-perf`

`laz-perf` (https://github.com/hobuinc/laz-perf) — LAZ decompression, WASM +
JS glue, redistributed unmodified (the `.wasm` is embedded as a base64 `data:`
URI in `dist/workers/EptLaszipDecoderWorker.js`). Copyright laz-perf
contributors (Hobu, Inc. and others). The package ships no `NOTICE` file.

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but not
      limited to compiled object code, generated documentation, and
      conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work (an
      example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the
      purposes of this License, Derivative Works shall not include works
      that remain separable from, or merely link (or bind by name) to the
      interfaces of, the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including the
      original version of the Work and any modifications or additions to
      that Work or Derivative Works thereof, that is intentionally submitted
      to Licensor for inclusion in the Work by the copyright owner or by an
      individual or Legal Entity authorized to submit on behalf of the
      copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control
      systems, and issue tracking systems that are managed by, or on behalf
      of, the Licensor for the purpose of discussing and improving the Work,
      but excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have
      made, use, offer to sell, sell, import, and otherwise transfer the
      Work, where such license applies only to those patent claims
      licensable by such Contributor that are necessarily infringed by
      their Contribution(s) alone or by combination of their
      Contribution(s) with the Work to which such Contribution(s) was
      submitted. If You institute patent litigation against any entity
      (including a cross-claim or counterclaim in a lawsuit) alleging that
      the Work or a Contribution incorporated within the Work constitutes
      direct or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate as of
      the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the Work
      or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You meet
      the following conditions:

      (a) You must give any other recipients of the Work or Derivative
          Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works that
          You distribute, all copyright, patent, trademark, and attribution
          notices from the Source form of the Work, excluding those notices
          that do not pertain to any part of the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one of
          the following places: within a NOTICE text file distributed as
          part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and do
          not modify the License. You may add Your own attribution notices
          within Derivative Works that You distribute, alongside or as an
          addendum to the NOTICE text from the Work, provided that such
          additional attribution notices cannot be construed as modifying
          the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions for
      use, reproduction, or distribution of Your modifications, or for any
      such Derivative Works as a whole, provided Your use, reproduction,
      and distribution of the Work otherwise complies with the conditions
      stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or agreed
      to in writing, Licensor provides the Work (and each Contributor
      provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES
      OR CONDITIONS OF ANY KIND, either express or implied, including,
      without limitation, any warranties or conditions of TITLE,
      NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR
      PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all other
      commercial damages or losses), even if such Contributor has been
      advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing the
      Work or Derivative Works thereof, You may choose to offer, and charge
      a fee for, acceptance of support, warranty, indemnity, or other
      liability obligations and/or rights consistent with this License.
      However, in accepting such obligations, You may act only on Your own
      behalf and on Your sole responsibility, not on behalf of any other
      Contributor, and only if You agree to indemnify, defend, and hold
      each Contributor harmless for any liability incurred by, or claims
      asserted against, such Contributor by reason of your accepting any
      such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

---

## Peer dependency (not redistributed)

**`three`** (MIT, © 2010-present three.js authors) is a `peerDependency`. It
is marked external in the build and is **not** included in `dist/` — the
consuming app installs and bundles it. Its license travels with that package
under `node_modules/three/LICENSE`.
