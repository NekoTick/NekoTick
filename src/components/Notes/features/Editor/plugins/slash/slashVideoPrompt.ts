import type { EditorView } from '@milkdown/kit/prose/view';
import { translate } from '@/lib/i18n';
import { getScrollRoot, getToolbarRoot, toContainerPosition } from '../floating-toolbar/floatingToolbarDom';
import { getContentLayoutContext } from '../floating-toolbar/floatingToolbarLayout';
import { renderUrlRailEditor } from '../floating-toolbar/components/UrlRailEditor';
import { isSupportedVideoUrl, normalizeVideoUrlInput } from '../video';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import { isEditableShortcutTarget } from '@/lib/shortcuts/editableGuards';

function getPromptPosition(view: EditorView) {
  try {
    const coords = view.coordsAtPos(view.state.selection.from);
    return {
      x: coords.left,
      y: coords.bottom + themeDomStyleTokens.editorPopupAnchorOffsetPx,
    };
  } catch {
    return {
      x: themeDomStyleTokens.editorPopupFallbackX,
      y: themeDomStyleTokens.editorPopupFallbackY,
    };
  }
}

export function openSlashVideoPrompt(args: {
  view: EditorView;
  onSubmit: (url: string) => void | Promise<void>;
}) {
  const { view, onSubmit } = args;
  const scrollRoot = getScrollRoot(view);
  const positionRoot = getToolbarRoot(view) ?? scrollRoot;
  const prompt = document.createElement('div');
  const close = () => {
    window.removeEventListener('mousedown', handleOutsideMouseDown, true);
    prompt.remove();
  };
  const handleOutsideMouseDown = (event: MouseEvent) => {
    if (event.target instanceof Node && prompt.contains(event.target)) return;
    close();
    if (isEditableShortcutTarget(event.target)) return;
    view.focus();
  };

  prompt.className = `slash-video-prompt !rounded-[var(--vlaina-notes-ui-radius-panel)] ${raisedPillSurfaceClass}`;
  prompt.setAttribute('data-no-editor-drag-box', 'true');
  prompt.style.position = positionRoot ? 'absolute' : 'fixed';
  (positionRoot ?? document.body).append(prompt);
  renderUrlRailEditor(prompt, {
    placeholder: translate('editor.videoUrlPlaceholder'),
    hint: translate('editor.videoUrlHint'),
    autoFocus: true,
    validate(url) {
      const normalizedUrl = normalizeVideoUrlInput(url);
      return normalizedUrl !== null && isSupportedVideoUrl(normalizedUrl);
    },
    onSubmit(url) {
      const normalizedUrl = normalizeVideoUrlInput(url);
      if (!normalizedUrl) return;
      close();
      onSubmit(normalizedUrl);
      view.focus();
    },
    onCancel() {
      close();
      view.focus();
    },
  });

  const viewportPosition = getPromptPosition(view);
  const containerPosition = toContainerPosition(viewportPosition, positionRoot);
  const layout = getContentLayoutContext(view, positionRoot);
  const promptWidth = prompt.offsetWidth || 320;
  const horizontalBounds = positionRoot
    ? {
        left: layout.containerBounds?.left ?? themeDomStyleTokens.editorPopupHorizontalMarginPx,
        right: layout.containerBounds?.right ?? positionRoot.clientWidth,
      }
    : {
        left: layout.viewportBounds.left,
        right: layout.viewportBounds.right,
      };
  const minX = horizontalBounds.left + themeDomStyleTokens.editorPopupHorizontalMarginPx;
  const maxX = horizontalBounds.right - themeDomStyleTokens.editorPopupHorizontalMarginPx - promptWidth;
  const x = maxX < minX ? minX : Math.max(minX, Math.min(containerPosition.x, maxX));

  prompt.style.left = `${Math.round(x)}px`;
  prompt.style.top = `${Math.round(containerPosition.y)}px`;
  window.addEventListener('mousedown', handleOutsideMouseDown, true);
}
