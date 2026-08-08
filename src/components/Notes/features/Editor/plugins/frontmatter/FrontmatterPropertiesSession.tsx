import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { FrontmatterPropertiesView } from './FrontmatterPropertiesView';
import {
  readFrontmatterProperties,
  type FrontmatterPropertiesResult,
} from './frontmatterPropertiesModel';

type FrontmatterPropertiesSessionOptions = {
  dom: HTMLElement;
  editorDOM: HTMLElement;
  editable: boolean;
  rawText: string;
  onChange: (rawText: string) => void;
  onSourceModeShown: () => void;
};

export class FrontmatterPropertiesSession {
  private readonly editorDOM: HTMLElement;
  private readonly host: HTMLElement;
  private readonly root: Root;
  private readonly onChange: (rawText: string) => void;
  private readonly onSourceModeShown: () => void;
  private editable: boolean;
  private rawText: string;
  private result: FrontmatterPropertiesResult;
  private sourceMode: boolean;

  constructor({
    dom,
    editorDOM,
    editable,
    rawText,
    onChange,
    onSourceModeShown,
  }: FrontmatterPropertiesSessionOptions) {
    this.editorDOM = editorDOM;
    this.editable = editable;
    this.rawText = rawText;
    this.result = readFrontmatterProperties(rawText);
    this.onChange = onChange;
    this.onSourceModeShown = onSourceModeShown;
    this.sourceMode = !this.result.valid;
    this.host = dom.ownerDocument.createElement('div');
    this.host.className = 'frontmatter-properties-host';
    dom.insertBefore(this.host, editorDOM);
    this.root = createRoot(this.host);
    this.render();
  }

  update(rawText: string, editable: boolean) {
    if (rawText === this.rawText && editable === this.editable) return;
    const wasSourceMode = this.sourceMode;
    this.rawText = rawText;
    this.editable = editable;
    this.result = readFrontmatterProperties(rawText);
    if (!this.result.valid) this.sourceMode = true;
    if (wasSourceMode) this.render();
    else flushSync(() => this.render());
  }

  isSourceMode() {
    return this.sourceMode;
  }

  private readonly setSourceMode = (sourceMode: boolean) => {
    if (!sourceMode && !this.result.valid) return;
    this.sourceMode = sourceMode;
    flushSync(() => this.render());
    if (sourceMode) this.onSourceModeShown();
  };

  private render() {
    this.editorDOM.hidden = !this.sourceMode;
    this.root.render(
      <FrontmatterPropertiesView
        editable={this.editable}
        rawText={this.rawText}
        result={this.result}
        sourceMode={this.sourceMode}
        onChange={this.onChange}
        onSourceModeChange={this.setSourceMode}
      />,
    );
  }

  destroy() {
    const root = this.root;
    (this.host.ownerDocument.defaultView ?? globalThis).setTimeout(() => root.unmount(), 0);
    this.host.remove();
  }
}
