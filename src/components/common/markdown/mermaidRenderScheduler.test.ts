import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import {
  getActiveMermaidRenderCount,
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  scheduleMermaidRenderTask,
} from './mermaidRenderScheduler';

describe('Mermaid render scheduler', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-layout-panel-dragging');
    document.body.replaceChildren();
    window.dispatchEvent(new MouseEvent('mouseup'));
  });

  it('shares one background concurrency budget across editor and read-only work', async () => {
    const started: number[] = [];
    const resolves: Array<(value: string) => void> = [];
    let maxActiveCount = 0;
    const taskCount = MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS * 2 + 3;
    const tasks = Array.from({ length: taskCount }, (_value, index) => (
      scheduleMermaidRenderTask({
        cancelledValue: '',
        group: index % 2 === 0 ? 'editor' : 'readonly',
        priority: 'background',
        render: () => new Promise<string>((resolve) => {
          started.push(index);
          resolves.push(resolve);
          maxActiveCount = Math.max(maxActiveCount, getActiveMermaidRenderCount());
        }),
      })
    ));

    await vi.waitFor(() => {
      expect(started).toHaveLength(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    });
    for (let index = 0; index < tasks.length; index += 1) {
      await vi.waitFor(() => {
        expect(resolves.length).toBeGreaterThan(index);
      });
      resolves[index]?.(`rendered ${index}`);
    }
    await Promise.all(tasks.map((task) => task.promise));

    expect(maxActiveCount).toBe(MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS);
    expect(getActiveMermaidRenderCount()).toBe(0);
  });

  it('pauses queued background work while a layout panel is dragging', async () => {
    document.documentElement.setAttribute('data-layout-panel-dragging', 'true');
    const render = vi.fn(async () => 'rendered');
    const task = scheduleMermaidRenderTask({
      cancelledValue: '',
      group: 'editor',
      priority: 'background',
      render,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(render).not.toHaveBeenCalled();

    document.documentElement.removeAttribute('data-layout-panel-dragging');
    window.dispatchEvent(new MouseEvent('mouseup'));
    await expect(task.promise).resolves.toBe('rendered');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('pauses queued background work while a block selection is dragging', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('data-editor-block-selection-pending', 'true');
    document.body.appendChild(editor);
    const render = vi.fn(async () => 'rendered');
    const task = scheduleMermaidRenderTask({
      cancelledValue: '',
      group: 'editor',
      priority: 'background',
      render,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(render).not.toHaveBeenCalled();

    editor.removeAttribute('data-editor-block-selection-pending');
    window.dispatchEvent(new MouseEvent('mouseup'));
    await expect(task.promise).resolves.toBe('rendered');
    expect(render).toHaveBeenCalledTimes(1);
    editor.remove();
  });

  it('runs near-viewport work one at a time during scrolling while background work stays paused', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(scrollRoot);
    const started: string[] = [];
    const resolves = new Map<string, (value: string) => void>();
    const schedule = (label: string, priority: 'background' | 'interactive') =>
      scheduleMermaidRenderTask({
        cancelledValue: '',
        group: 'editor',
        priority,
        render: () => new Promise<string>((resolve) => {
          started.push(label);
          resolves.set(label, resolve);
        }),
      });

    const background = schedule('background', 'background');
    const first = schedule('near-1', 'interactive');
    const second = schedule('near-2', 'interactive');

    await vi.waitFor(() => {
      expect(started).toEqual(['near-1']);
    });
    resolves.get('near-1')?.('rendered near-1');
    await vi.waitFor(() => {
      expect(started).toEqual(['near-1', 'near-2']);
    });
    resolves.get('near-2')?.('rendered near-2');
    await expect(first.promise).resolves.toBe('rendered near-1');
    await expect(second.promise).resolves.toBe('rendered near-2');
    expect(started).not.toContain('background');

    delete scrollRoot.dataset.overlayScrollbarInteracting;
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    await vi.waitFor(() => {
      expect(started).toContain('background');
    });
    resolves.get('background')?.('rendered background');
    await expect(background.promise).resolves.toBe('rendered background');
  });

  it('keeps near-viewport work paused for blocking interactions during scrolling', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.dataset.overlayScrollbarInteracting = 'true';
    document.body.appendChild(scrollRoot);
    document.documentElement.dataset.layoutPanelDragging = 'true';
    const render = vi.fn(async () => 'rendered');
    const task = scheduleMermaidRenderTask({
      cancelledValue: '',
      group: 'editor',
      priority: 'interactive',
      render,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(render).not.toHaveBeenCalled();

    delete document.documentElement.dataset.layoutPanelDragging;
    window.dispatchEvent(new MouseEvent('mouseup'));
    await expect(task.promise).resolves.toBe('rendered');
    expect(scrollRoot.dataset.overlayScrollbarInteracting).toBe('true');
  });
});
