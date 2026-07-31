import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode, NodeType } from '@milkdown/kit/prose/model';
import { TextSelection, type Selection, type Transaction } from '@milkdown/kit/prose/state';
import { replaceVisibleBlockSelectionWithCursor } from '../cursor/blockSelectionReplacement';
import { markEditorImageUserInput } from '../shared/userInputEvents';

export function buildImageNodeAttrs(src: string) {
    const pathOnly = src.split(/[?#]/, 1)[0] || src;
    const fileName = pathOnly.split(/[\\/]/).pop() || pathOnly;
    const alt = fileName.replace(/\.[^/.]+$/, '');

    return {
        src,
        alt,
        align: 'center' as const,
        width: null,
    };
}

function createImageNode(view: EditorView, src: string) {
    const imageNodeType = view.state.schema.nodes.image;
    if (!imageNodeType) return null;
    return imageNodeType.create(buildImageNodeAttrs(src));
}

function findInsertedImagePos(tr: Transaction, imageNode: ProseNode): number | null {
    for (const pos of [tr.selection.from - imageNode.nodeSize, tr.selection.from]) {
        if (pos < 0 || pos > tr.doc.content.size) continue;
        const candidate = tr.doc.nodeAt(pos);
        if (candidate?.type === imageNode.type && candidate.attrs.src === imageNode.attrs.src) {
            return pos;
        }
    }
    return null;
}

function isolateImageAndPlaceCaretAfter(
    tr: Transaction,
    imageNode: ProseNode,
    paragraphType: NodeType | undefined,
): Transaction {
    if (!paragraphType) return tr;

    let imagePos = findInsertedImagePos(tr, imageNode);
    if (imagePos === null) return tr;
    const $image = tr.doc.resolve(imagePos);
    if (!$image.parent.inlineContent) return tr;

    if ($image.parentOffset > 0) {
        tr.split(imagePos, 1, [{ type: paragraphType }]);
        imagePos = findInsertedImagePos(tr, imageNode);
        if (imagePos === null) return tr;
    } else if ($image.parent.type !== paragraphType) {
        tr.setNodeMarkup($image.before(), paragraphType);
    }

    imagePos = findInsertedImagePos(tr, imageNode);
    if (imagePos === null) return tr;
    const $isolatedImage = tr.doc.resolve(imagePos);
    const afterImagePos = imagePos + imageNode.nodeSize;
    if (afterImagePos === $isolatedImage.end()) {
        const afterParagraphPos = $isolatedImage.after($isolatedImage.depth);
        const followingNode = tr.doc.nodeAt(afterParagraphPos);
        if (followingNode?.type === paragraphType) {
            return tr.setSelection(TextSelection.create(tr.doc, afterParagraphPos + 1));
        }
    }

    tr.split(afterImagePos, 1, [{ type: paragraphType }]);
    return tr;
}

function replaceSelectionWithImageNodes(
    view: EditorView,
    imageNodes: readonly ProseNode[],
    selection?: Selection,
): Transaction {
    const tr = selection ? view.state.tr.setSelection(selection) : view.state.tr;
    replaceVisibleBlockSelectionWithCursor(view, tr);
    for (const imageNode of imageNodes) {
        tr.replaceSelectionWith(imageNode);
        isolateImageAndPlaceCaretAfter(tr, imageNode, view.state.schema.nodes.paragraph);
    }
    return tr;
}

export function canInsertImageNodeAtSelection(view: EditorView, selection?: Selection): boolean {
    const imageNode = createImageNode(view, './image.png');
    if (!imageNode) return false;

    try {
        const tr = replaceSelectionWithImageNodes(view, [imageNode], selection);
        return tr.docChanged;
    } catch {
        return false;
    }
}

export function insertImageNodesAtSelection(
    view: EditorView,
    imageNodes: readonly ProseNode[],
    selection?: Selection,
): boolean {
    if (imageNodes.length === 0) return false;

    try {
        markEditorImageUserInput(view);
        view.dispatch(replaceSelectionWithImageNodes(view, imageNodes, selection).scrollIntoView());
        return true;
    } catch {
        return false;
    }
}

export function insertImageNodeAtSelection(view: EditorView, src: string, selection?: Selection): boolean {
    const imageNode = createImageNode(view, src);
    if (!imageNode) {
        return false;
    }
    return insertImageNodesAtSelection(view, [imageNode], selection);
}
