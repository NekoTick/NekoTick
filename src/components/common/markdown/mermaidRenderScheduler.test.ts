import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveMermaidRenderCount,
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  scheduleMermaidRenderTask,
} from './mermaidRenderScheduler';

describe('Mermaid render scheduler', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-layout-panel-dragging');
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
});
