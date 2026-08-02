export function createIpcSenderAbortRegistry(createAbortReason) {
  const entries = new WeakMap();

  return {
    track(sender, controller) {
      if (typeof sender?.once !== 'function') return () => {};

      let entry = entries.get(sender);
      if (!entry) {
        const controllers = new Set();
        const abortAll = () => {
          entries.delete(sender);
          const activeControllers = Array.from(controllers);
          controllers.clear();
          for (const activeController of activeControllers) {
            activeController.abort(createAbortReason());
          }
        };
        entry = { abortAll, controllers };
        entries.set(sender, entry);
        sender.once('destroyed', abortAll);
      }

      entry.controllers.add(controller);
      let tracked = true;
      return () => {
        if (!tracked) return;
        tracked = false;
        entry.controllers.delete(controller);
        if (entry.controllers.size === 0 && entries.get(sender) === entry) {
          entries.delete(sender);
          sender.removeListener?.('destroyed', entry.abortAll);
        }
      };
    },
  };
}
