export interface TailBlankClickAction {
    mode: 'reuse-existing' | 'insert-temporary';
    targetPos: number;
    bias: 1 | -1;
}

export const isClickBelowLastBlock = (
    editorDom: HTMLElement,
    clientY: number,
): boolean => {
    let lastElement = editorDom.lastElementChild as HTMLElement | null;
    while (lastElement?.matches('.heading-collapsed-content, .editor-collapsed-content')) {
        lastElement = lastElement.previousElementSibling as HTMLElement | null;
    }
    if (!lastElement) return false;
    const lastRect = lastElement.getBoundingClientRect();
    return clientY > lastRect.bottom;
};

export const resolveTailBlankClickAction = (state: {
    doc: {
        content: { size: number };
        lastChild: { type?: { name?: string }; content?: { size: number } } | null;
        type: { schema: { nodes: { paragraph?: unknown } } };
    };
}): TailBlankClickAction | null => {
    const docEnd = state.doc.content.size;
    const lastNode = state.doc.lastChild;
    const paragraphType = state.doc.type.schema.nodes.paragraph;

    if (lastNode?.type?.name === 'paragraph' && lastNode.content?.size === 0) {
        return {
            mode: 'reuse-existing',
            targetPos: Math.max(0, docEnd - 1),
            bias: -1,
        };
    }

    if (paragraphType) {
        return {
            mode: 'insert-temporary',
            targetPos: docEnd + 1,
            bias: 1,
        };
    }

    return null;
};
