# Third-Party Notices

This project is licensed as a whole under the GNU Affero General Public License
version 3.0. See [LICENSE](LICENSE).

Some files include or adapt third-party material under permissive licenses. Those
licenses remain in effect for the covered third-party material.

This file is a practical attribution index, not a replacement for a full legal
review before release.

## Vendored Source

### Milkdown

- Location: `vendor/milkdown/`
- Upstream: https://github.com/Milkdown/milkdown
- License: MIT
- Copyright: Copyright (c) 2020-present Mirone
- License text: [vendor/milkdown/LICENSE](vendor/milkdown/LICENSE)

## Adapted Source And Assets

### Pretext

- Location: `src/lib/text-layout/pretext/`
- Source: `@chenglou/pretext`
- Upstream: https://github.com/chenglou/pretext
- License: MIT
- Copyright: Copyright (c) 2026 Pretext contributors
- Notes: The local text-layout helpers are adapted from Pretext and related
  text-layout research credited in the source comments.

### Mermaid Theme

- Location: `src/lib/notes/mermaid/mermaidTheme.ts`
- Source: `beautiful-mermaid`
- Upstream: https://github.com/lukilabs/beautiful-mermaid
- License: MIT
- Copyright: Copyright (c) 2026 Luki Labs

### GitHub Light Code Syntax Colors

- Locations:
  - `src/index.css`
  - `src/components/common/code-block/codeBlockChrome.css`
  - `src/components/Notes/features/Editor/plugins/code/codemirror/codeBlockHighlightStyle.ts`
- Source: GitHub Light / Primer syntax color values
- Upstream: https://github.com/primer/primitives
- License: MIT
- Copyright: Copyright (c) GitHub Inc.
- Notes: Local code block styling adapts the GitHub Light syntax palette for
  chat Markdown code blocks and Notes editor CodeMirror blocks. GitHub
  trademarks and brand assets are not relicensed under this project's AGPLv3
  license.

### Custom MIT/Permissive Icon Sources

- Location: `src/components/ui/icons/custom/mit/`
- These icons are adapted from the following upstream projects unless marked as
  custom app artwork in the source file:

| Upstream project | Local files | License | Copyright / notice |
| --- | --- | --- | --- |
| Eva Icons | `ActivityIcon.tsx` | MIT | Eva Icons / Akveo |
| GitHub Primer / Octicons | `FileDirectoryFillIcon.tsx`, `FileDirectoryIcon.tsx`, `FileDirectoryOpenArrowIcon.tsx`, `FileDirectoryOpenFillIcon.tsx`, `PrimerLightbulbIcon.tsx`, `PrimerPinIcon.tsx`, `PrimerUnpinIcon.tsx` | MIT | Copyright (c) 2026 GitHub Inc. |
| Google logo | `GoogleIcon.tsx` | Brand asset | Google logo used for provider/account identification; not relicensed under this project's AGPLv3 license. |
| Lucide Icons | `CropIcon.tsx`, `FolderOutputIcon.tsx`, `RenameIcon.tsx`, `UnlinkIcon.tsx` | ISC | Copyright (c) 2026 Lucide Icons and Contributors |
| Ollama | `SendIcon.tsx`, `SquareStopIcon.tsx` | MIT | Copyright (c) Ollama |
| Phosphor Icons | `MagicWandIcon.tsx`, `ReviewApplyIcon.tsx`, `ReviewCloseIcon.tsx`, `ReviewRetryIcon.tsx`, `ShootingStarIcon.tsx`, `ShootingStarIconData.ts`, `TemporaryChatOffIcon.tsx`, `TemporaryChatOnIcon.tsx` | MIT | Copyright (c) 2023 Phosphor Icons |
| Custom app artwork | `SidebarDockIcon.tsx` | MIT | Project-authored app icon. |

### Inline Editor And UI SVG Icon Snippets

- Locations:
  - `src/components/ui/icons/editor-svgs.ts`
  - `src/components/Notes/features/Editor/plugins/floating-toolbar/components/BlockDropdown.ts`
  - `src/components/Notes/features/Editor/plugins/shared/previewContextMenu.ts`
  - `src/components/Notes/features/Editor/plugins/cursor/blockControlsDom.ts`
  - `src/components/Notes/features/Editor/plugins/drag/dragPlugin.ts`
  - `src/components/Chat/ChatView.tsx`
  - `src/components/layout/shell/UnifiedTitleBar.tsx`
  - `src/components/Chat/features/Sidebar/ChatSidebarTopActions.tsx`
  - `src/components/Chat/features/Input/ModelSelector.tsx`
  - `src/components/Chat/features/Messages/components/ThinkingBlock.tsx`
- These files include small inline SVG icon paths for editor and shell controls.
  The paths are custom app artwork, or adapted from permissive icon sets already
  used by the project:

| Upstream project | Local use | License | Copyright / notice |
| --- | --- | --- | --- |
| Lucide Icons | text formatting, link, image, arrow, sidebar, and book/image style outline icons | ISC | Copyright (c) 2026 Lucide Icons and Contributors |
| Phosphor Icons | review action and high-detail block drag-handle glyphs | MIT | Copyright (c) 2023 Phosphor Icons |
| Custom app artwork | simple block drag-handle dot glyph | MIT | Project-authored app icon. |

### Provider, Model, And Service Logos

- Locations:
  - `src/components/Chat/assets/providers/`
  - `src/components/Chat/assets/model-families/`
  - `src/assets/welcome-insignias/github.png`
- These assets include third-party provider, model-family, service, and platform
  logos. They are used for identification and remain the property of their
  respective owners.
- These logo and brand assets are not relicensed under this project's AGPLv3
  license. Trademark and brand usage rights are separate from copyright license
  rights.
- Some model-family SVG files include `lobe-icons-*` identifiers and appear to
  be adapted from Lobe Icons, an MIT-licensed AI/LLM brand icon collection:
  https://github.com/lobehub/lobe-icons
- Lobe Icons copyright: Copyright (c) 2023 LobeHub.
- `src/components/Chat/assets/providers/macos.svg` contains SVG Repo generator
  metadata. Before publishing a release artifact, verify and record the exact
  SVG Repo source page and license terms for that asset, or replace it with a
  self-owned/permissively licensed equivalent.

## Package Dependencies

This repository also uses package-manager dependencies listed in
[package.json](package.json) and locked in [pnpm-lock.yaml](pnpm-lock.yaml).
Those packages retain their own licenses and notices as distributed with their
package metadata and license files.

The Board AutoDraw feature specifically uses `lucide-react` outline geometry
(ISC, Copyright (c) 2026 Lucide Icons and Contributors) for its local object
catalog and `points-on-path` (MIT, Copyright (c) 2020 Preet) for local SVG
outline sampling. It does not use or redistribute Google AutoDraw's recognition
service, model, or drawing assets.

Before publishing installers or source archives, verify that the generated
artifact includes the required license files/notices for bundled dependencies.

## MIT License Text

Permission is hereby granted, free of charge, to any person obtaining a copy of
the covered software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## ISC License Text

Permission to use, copy, modify, and/or distribute the covered software for any
purpose with or without fee is hereby granted, provided that the above copyright
notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
