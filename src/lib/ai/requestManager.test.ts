import { afterEach, describe, expect, it } from 'vitest';
import { aliasSessionId, clearSessionIdAliases, resolveSessionIdAlias } from './sessionIdAliases';
import { RequestManager } from './requestManager';

describe('RequestManager', () => {
  afterEach(() => {
    clearSessionIdAliases();
  });

  it('transfers a controller from the original session id after an alias is already registered', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');

    expect(manager.isGenerating('session-1')).toBe(true);
    expect(manager.isGenerating('temp-session-1')).toBe(true);

    manager.abort('session-1');

    expect(controller.signal.aborted).toBe(true);
    expect(manager.isGenerating('session-1')).toBe(false);
  });

  it('clears an alias when a transferred request finishes after it was aborted through the promoted id', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    manager.abort('session-1');
    manager.finish('temp-session-1', controller);

    expect(resolveSessionIdAlias('temp-session-1')).toBe('temp-session-1');
    expect(manager.isGenerating('temp-session-1')).toBe(false);
  });

  it('clears aliases that resolve to a promoted session when aborting the promoted id', () => {
    const manager = new RequestManager();
    const controller = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    manager.abort('session-1');

    expect(controller.signal.aborted).toBe(true);
    expect(resolveSessionIdAlias('temp-session-1')).toBe('temp-session-1');
    expect(manager.isGenerating('temp-session-1')).toBe(false);
  });

  it('keeps aliases for an active controller when a superseded transferred request finishes', () => {
    const manager = new RequestManager();
    const firstController = manager.start('temp-session-1');

    aliasSessionId('temp-session-1', 'session-1');
    manager.transfer('temp-session-1', 'session-1');
    const secondController = manager.start('session-1');

    expect(firstController.signal.aborted).toBe(true);
    expect(manager.isCurrent('session-1', secondController)).toBe(true);
    expect(manager.isCurrent('temp-session-1', secondController)).toBe(true);

    manager.finish('temp-session-1', firstController);

    expect(resolveSessionIdAlias('temp-session-1')).toBe('session-1');
    expect(manager.isCurrent('session-1', secondController)).toBe(true);
    expect(manager.isCurrent('temp-session-1', secondController)).toBe(true);
    expect(secondController.signal.aborted).toBe(false);
  });

});
