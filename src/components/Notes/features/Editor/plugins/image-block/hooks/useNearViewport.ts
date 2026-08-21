import { RefObject, useEffect, useState } from 'react';
import { themeLazyLoadTokens } from '@/styles/themeTokens';

const BACKGROUND_LOAD_START_DELAY_MS = themeLazyLoadTokens.imageBackgroundLoadStartDelayMs;
const BACKGROUND_LOAD_INTERVAL_MS = 180;
const BACKGROUND_LOAD_BATCH_SIZE = 2;

type BackgroundLoadTask = () => void;

interface BackgroundLoadQueueItem {
    canceled: boolean;
    task: BackgroundLoadTask;
}

interface NearViewportState {
    isNearViewport: boolean;
    shouldLoadImage: boolean;
}

let backgroundLoadQueue: BackgroundLoadQueueItem[] = [];
let backgroundLoadTimer: number | null = null;
let hasStartedBackgroundLoads = false;

function scheduleBackgroundLoads() {
    if (backgroundLoadTimer !== null || typeof window === 'undefined') {
        return;
    }

    const delay = hasStartedBackgroundLoads
        ? BACKGROUND_LOAD_INTERVAL_MS
        : BACKGROUND_LOAD_START_DELAY_MS;

    backgroundLoadTimer = window.setTimeout(() => {
        backgroundLoadTimer = null;
        hasStartedBackgroundLoads = true;

        const batch: BackgroundLoadQueueItem[] = [];
        while (batch.length < BACKGROUND_LOAD_BATCH_SIZE && backgroundLoadQueue.length > 0) {
            const item = backgroundLoadQueue.shift();
            if (item && !item.canceled) {
                batch.push(item);
            }
        }

        for (const item of batch) {
            item.task();
        }

        if (backgroundLoadQueue.length > 0) {
            scheduleBackgroundLoads();
        } else {
            hasStartedBackgroundLoads = false;
        }
    }, delay);
}

function enqueueBackgroundLoad(task: BackgroundLoadTask): () => void {
    const item = { canceled: false, task };
    backgroundLoadQueue.push(item);
    scheduleBackgroundLoads();

    return () => {
        item.canceled = true;
    };
}

export function useNearViewport(targetRef: RefObject<Element | null>): NearViewportState {
    const shouldLoadImmediately = () => (
        typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
    );
    const [isNearViewport, setIsNearViewport] = useState(shouldLoadImmediately);
    const [shouldLoadImage, setShouldLoadImage] = useState(shouldLoadImmediately);

    useEffect(() => {
        if (isNearViewport) {
            return;
        }

        const target = targetRef.current;
        if (!target) {
            return;
        }

        if (typeof IntersectionObserver === 'undefined') {
            setIsNearViewport(true);
            setShouldLoadImage(true);
            return;
        }

        let hasResolvedViewport = false;
        let hasResolvedLoad = false;
        let observer: IntersectionObserver | null = null;
        let cancelBackgroundLoad: () => void = () => undefined;

        const resolveImageLoad = () => {
            if (hasResolvedLoad) {
                return;
            }

            hasResolvedLoad = true;
            setShouldLoadImage(true);
            cancelBackgroundLoad();
        };

        const resolveNearViewport = () => {
            if (hasResolvedViewport) {
                return;
            }

            hasResolvedViewport = true;
            setIsNearViewport(true);
            resolveImageLoad();
            observer?.disconnect();
        };

        observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                resolveNearViewport();
            }
        }, {
            root: null,
            rootMargin: themeLazyLoadTokens.imageBlockRootMargin,
            threshold: 0,
        });

        observer.observe(target);
        cancelBackgroundLoad = enqueueBackgroundLoad(resolveImageLoad);

        return () => {
            hasResolvedViewport = true;
            hasResolvedLoad = true;
            cancelBackgroundLoad();
            observer?.disconnect();
        };
    }, [isNearViewport, targetRef]);

    return { isNearViewport, shouldLoadImage };
}

export const __testing__ = {
    clearBackgroundImageLoadQueue() {
        backgroundLoadQueue = [];
        hasStartedBackgroundLoads = false;
        if (backgroundLoadTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(backgroundLoadTimer);
        }
        backgroundLoadTimer = null;
    },
    BACKGROUND_LOAD_BATCH_SIZE,
    BACKGROUND_LOAD_START_DELAY_MS,
    BACKGROUND_LOAD_INTERVAL_MS,
};
