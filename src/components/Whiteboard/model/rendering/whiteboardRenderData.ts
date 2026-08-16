import type { WhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import type { WhiteboardElement, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import type { WhiteboardSelectedOverlayGeometry } from '@/components/Whiteboard/model/interaction/whiteboardSelection';

const EMPTY_IDS: string[] = [];

export class WhiteboardRenderData {
  readonly #elements: WhiteboardElement[];
  readonly #selectedElementIds: string[];
  readonly #selectedStrokeIds: string[];
  readonly #spatialIndex: WhiteboardEraserSpatialIndex;
  readonly #strokes: WhiteboardStroke[];
  readonly #selectionGeometry: WhiteboardSelectedOverlayGeometry | null;

  constructor(
    elements: WhiteboardElement[],
    spatialIndex: WhiteboardEraserSpatialIndex,
    strokes: WhiteboardStroke[],
    selectionGeometry: WhiteboardSelectedOverlayGeometry | null = null,
    selectedElementIds: string[] = EMPTY_IDS,
    selectedStrokeIds: string[] = EMPTY_IDS,
  ) {
    this.#elements = elements;
    this.#selectedElementIds = selectedElementIds;
    this.#selectedStrokeIds = selectedStrokeIds;
    this.#spatialIndex = spatialIndex;
    this.#strokes = strokes;
    this.#selectionGeometry = selectionGeometry;
  }

  get elements(): WhiteboardElement[] {
    return this.#elements;
  }

  get spatialIndex(): WhiteboardEraserSpatialIndex {
    return this.#spatialIndex;
  }

  get selectedElementIds(): string[] {
    return this.#selectedElementIds;
  }

  get selectedStrokeIds(): string[] {
    return this.#selectedStrokeIds;
  }

  get strokes(): WhiteboardStroke[] {
    return this.#strokes;
  }

  get selectionGeometry(): WhiteboardSelectedOverlayGeometry | null {
    return this.#selectionGeometry;
  }
}

export class WhiteboardSelectionRenderData {
  readonly #elements: WhiteboardElement[];
  readonly #strokes: WhiteboardStroke[];
  readonly #geometry: WhiteboardSelectedOverlayGeometry | null;
  readonly #requiresProportionalResize: boolean;

  constructor(
    elements: WhiteboardElement[],
    strokes: WhiteboardStroke[],
    geometry: WhiteboardSelectedOverlayGeometry | null = null,
    requiresProportionalResize = elements.some((element) => (
      element.type === 'text' || (element.type === 'icon' && Boolean(element.autoDrawIcon))
    )),
  ) {
    this.#elements = elements;
    this.#strokes = strokes;
    this.#geometry = geometry;
    this.#requiresProportionalResize = requiresProportionalResize;
  }

  get elements(): WhiteboardElement[] {
    return this.#elements;
  }

  get strokes(): WhiteboardStroke[] {
    return this.#strokes;
  }

  get geometry(): WhiteboardSelectedOverlayGeometry | null {
    return this.#geometry;
  }

  get requiresProportionalResize(): boolean {
    return this.#requiresProportionalResize;
  }
}
