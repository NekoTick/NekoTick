import { writeWhiteboardBoard, type WhiteboardIndexEntry } from '@/components/Whiteboard/model/persistence';
import type { WhiteboardSnapshot } from '@/components/Whiteboard/model/document';

interface SnapshotWriteWaiter {
  reject: (reason?: unknown) => void;
  resolve: (byteLength: number) => void;
}

interface PendingSnapshotWrite {
  board: WhiteboardIndexEntry;
  notesRootPath: string;
  snapshot: WhiteboardSnapshot;
  waiters: SnapshotWriteWaiter[];
}

interface SnapshotWriteQueue {
  drain: Promise<void> | null;
  pending: PendingSnapshotWrite | null;
}

const queues = new Map<string, SnapshotWriteQueue>();

export function queueWhiteboardSnapshotWrite(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
  snapshot: WhiteboardSnapshot,
): Promise<number> {
  const key = `${notesRootPath}\n${board.folder}`;
  const queue = queues.get(key) ?? { drain: null, pending: null };
  queues.set(key, queue);
  return new Promise<number>((resolve, reject) => {
    const waiters = [...queue.pending?.waiters ?? [], { reject, resolve }];
    queue.pending = { board, notesRootPath, snapshot, waiters };
    if (!queue.drain) queue.drain = drainSnapshotWrites(key, queue);
  });
}

export async function waitForWhiteboardSnapshotWrites(): Promise<void> {
  while (queues.size > 0) {
    await Promise.all([...queues.values()].flatMap((queue) => queue.drain ? [queue.drain] : []));
  }
}

async function drainSnapshotWrites(key: string, queue: SnapshotWriteQueue): Promise<void> {
  while (queue.pending) {
    const request = queue.pending;
    queue.pending = null;
    try {
      const byteLength = await writeWhiteboardBoard(request.notesRootPath, request.board, request.snapshot);
      request.waiters.forEach((waiter) => waiter.resolve(byteLength));
    } catch (error) {
      request.waiters.forEach((waiter) => waiter.reject(error));
    }
  }
  queue.drain = null;
  if (queues.get(key) === queue) queues.delete(key);
}
