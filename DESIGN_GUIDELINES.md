# NekoTick Design Language: "Liquid Light"
> Version 1.0 - The "Soul" Update

## 1. Core Philosophy
NekoTick's design is not merely a collection of features; it pursues a texture of **"Liquid Light"**.
We reject cheap, industrial, "generic" designs. Our interface should flow like water, be translucent like light, and be exquisite like a piece of art.

**Three Pillars:**
1.  **Premium**: Quality over quantity. Use fine lines, sophisticated greys, and soft shadows. Reject high-saturation color clashes.
2.  **Soulful**: Interactions must have physical feedback. Icons are not dead textures but tangible objects with volume.
3.  **Minimalist**: Hide distracting elements (like scrollbars or non-essential buttons) until the user needs them.

---

## 2. Iconography
This is the visual soul of NekoTick. **Strictly prohibited** to use default Lucide or Feather icons with thick strokes.

### Specifications
*   **Library**: Must use `@phosphor-icons/react`.
*   **Inactive State**:
    *   Style: `weight="light"`
    *   Visual: Fine, sharp, elegant. Reminiscent of Apple's design language.
    *   Color: `text-zinc-400` or `text-zinc-500`.
*   **Active/Highlight State**:
    *   Style: `weight="duotone"`
    *   Visual: Features a fill layer with 20% opacity naturally, adding volume and depth.
    *   **Strictly Prohibited**: Manually setting `fillOpacity={0.05}` or extremely low values, which causes icons to become "invisible".
    *   Color: `text-zinc-900` (Light Mode) / `text-zinc-100` (Dark Mode).

### Code Example
```tsx
import { Fire } from '@phosphor-icons/react';

// Correct Usage
<Fire weight="light" className="text-zinc-400" /> // Resting state
<Fire weight="duotone" className="text-zinc-900" /> // Active state
```

---

## 3. Component Specs

### 3.1 The Totem Input (Task Creation)
*   **Location**: The core input area in `CreateModal`.
*   **Alignment**: `text-center`. The caret must blink in the exact center, with text growing outward, creating a sense of ceremony.
*   **Layout**: Icon button on the left, input field on the right, vertically centered.
*   **Persistence**: When switching between Journey and Counter modes, user-entered titles and selected icons **must** be preserved.

### 3.2 Item Card
*   **Texture**:
    *   Background: Pure White / Deep Black + subtle borders.
    *   Shadow: `shadow-lg` but with a large diffusion radius and low opacity to create a levitation effect.
*   **Visibility**:
    *   Icons in the list must be clearly visible (`text-zinc-600`), using the `duotone` style.
    *   **Absolutely Prohibited**: Making icons too pale to be legible.
*   **Interaction**:
    *   Completion: Play the "Liquid" fill animation, filling the card from left to right.

### 3.3 Scrollbar
*   **Global Style**: Reject default system scrollbars.
*   **Styling**:
    *   Width: `w-1.5` (Ultra-thin).

3.  **The Void Option**
    *   **"None" is an Option**: Do not use a separate "Remove" button if "Empty" can be represented as a choice.
    *   **Visual Metaphor**: Represents "Nothingness" with a subtle symbol (e.g., a faint Prohibit icon) inside the selection grid.
    *   *Result*: A cleaner header and a unified mental model.

4.  **Liquid Tuning (Global Edit)**
    *   **WYSIWYG**: Editing happens *in place*. Text turns into input, numbers turn into fields. No separate "Edit Modal".
    *   **One Check to Rule Them All**: A single, floating, satisfying confirmation button. No micro-saves.

## 4. Visual Hierarchy (The Crown Layout)

Structure information like a monarchy, not a spreadsheet.

1.  **The Crown (Identity)**: The Title sits at the top, commanding the card. It is the "Who".
2.  **The Hero (Status)**: The Number is massive, thin, and central. It is the "What".
3.  **The Footman (Control)**: Actions (Check button) float at the bottom, waiting for command.
4.  **Zero Borders**:
    *   **Kill the Lines**: Do not use `border-b` for inputs. Use text color/caret to imply focus.
    *   **Space is the Divider**: Use whitespace to separate sections. Lines are visual noise.

## 5. Components

### Modals
- **Backdrop**: `bg-zinc-100/60` (Light) or `bg-black/80` (Dark) with `backdrop-blur-xl`.
- **Card**: Rounded corners `rounded-[3rem]`. Floating, detached from the edges.

### Icons
- **Library**: Phosphor Icons (React).
- **Weights**:
  - `Duotone` for selected/active states (Rich).
  - `Light` for default states (Elegant).
  - `Regular` for interactive elements.
- **The Void**: A faint `Prohibit` icon represents "No Icon".

---

## 6. Colors & Materials
Use the **Zinc** scale to express sophistication, rather than pure black or white.

*   **Surface**: `bg-white/90` or `bg-zinc-900/90` + `backdrop-blur-xl` (Frosted Glass).
*   **Text Primary**: `text-zinc-900` / `text-zinc-100`.
*   **Text Secondary**: `text-zinc-400` (For labels, inactive states).
*   **Accent**: Minimize the use of colors. If necessary, use only as accents (e.g., red for delete actions).

---

## 7. Motion
Use `framer-motion`.

*   **Physics**: Use `type: "spring"`.
*   **Recommended Params**: `stiffness: 400`, `damping: 30` (Fast response with natural damping).
*   **Reject**: Linear animations (`linear`) or simple `ease-in-out`, unless for color transitions.

---

> "Keep it Holy, Keep it High-End."
> Maintain high standards and continue the legacy of top-tier design.
