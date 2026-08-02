import { requireSafeIpcRequestId } from './managedIpcCommon.mjs';
import {
  createAbortError,
  raceWithAbort,
  sanitizeManagedJsonIpcError,
} from './managedIpcErrors.mjs';
import { createIpcSenderAbortRegistry } from './ipcSenderAbortRegistry.mjs';

const activeManagedJsonRequests = new Map();
const activeManagedJsonOperations = new Set();
const managedJsonSenderAbortRegistry = createIpcSenderAbortRegistry(createAbortError);
const MAX_ACTIVE_MANAGED_JSON_REQUESTS = 16;

function deleteActiveManagedJsonRequest(active) {
  if (active.requestId && activeManagedJsonRequests.get(active.requestId) === active) {
    activeManagedJsonRequests.delete(active.requestId);
  }
  activeManagedJsonOperations.delete(active);
  active.untrackSender();
}

function isCurrentManagedJsonRequest(active) {
  if (!activeManagedJsonOperations.has(active)) return false;
  if (active.requestId && activeManagedJsonRequests.get(active.requestId) !== active) {
    return false;
  }
  return true;
}

function beginManagedJsonRequest(requestId, sender) {
  const previous = requestId ? activeManagedJsonRequests.get(requestId) : null;
  if (previous) {
    throw new Error('A managed request with this id is already active.');
  }
  if (activeManagedJsonOperations.size >= MAX_ACTIVE_MANAGED_JSON_REQUESTS) {
    throw new Error('Too many managed requests are active.');
  }

  const controller = new AbortController();
  const active = {
    controller,
    requestId,
    sender,
    untrackSender: () => {},
  };
  activeManagedJsonOperations.add(active);
  if (requestId) {
    activeManagedJsonRequests.set(requestId, active);
  }
  active.untrackSender = managedJsonSenderAbortRegistry.track(sender, controller);
  if (sender?.isDestroyed?.()) controller.abort(createAbortError());
  return active;
}

function cancelActiveManagedJsonRequest(active) {
  active.controller.abort();
  deleteActiveManagedJsonRequest(active);
}

export function parseOptionalManagedRequestId(requestIdOrPayload, maybePayload, label) {
  if (maybePayload === undefined) {
    return { requestId: null, payload: requestIdOrPayload };
  }

  return {
    requestId: requireSafeIpcRequestId(requestIdOrPayload, label),
    payload: maybePayload,
  };
}

export async function runManagedJsonOperation(operation, requestId, sender) {
  const active = beginManagedJsonRequest(requestId, sender);
  const { controller } = active;

  try {
    const managedRequest = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw createAbortError();
      return operation(controller.signal);
    });
    const result = await raceWithAbort(managedRequest, controller.signal);
    if (!isCurrentManagedJsonRequest(active) || controller.signal.aborted) {
      throw createAbortError();
    }
    return result;
  } catch (error) {
    if (!isCurrentManagedJsonRequest(active) || controller.signal.aborted) {
      throw createAbortError();
    }
    throw sanitizeManagedJsonIpcError(error);
  } finally {
    deleteActiveManagedJsonRequest(active);
  }
}

export async function requestManagedJsonWithOptionalCancel(
  requestManagedJson,
  requestId,
  sender,
  pathname,
  init,
) {
  return await runManagedJsonOperation(
    (signal) => requestManagedJson(pathname, { ...init, signal }),
    requestId,
    sender,
  );
}

export function cancelManagedJsonRequest(requestId, label, sender) {
  const id = requireSafeIpcRequestId(requestId, label);
  const active = activeManagedJsonRequests.get(id);
  if (!active || active.sender !== sender) return false;
  cancelActiveManagedJsonRequest(active);
  return true;
}
