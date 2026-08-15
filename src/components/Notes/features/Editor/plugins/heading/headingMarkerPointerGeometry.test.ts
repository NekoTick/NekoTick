import { describe, expect, it } from 'vitest';
import {
    isPointerPathPastHeadingMarker,
    projectPointerToHeadingLine,
} from './headingMarkerPointerGeometry';

const markerRect = { bottom: 590, right: 419, top: 551 };

describe('heading marker pointer geometry', () => {
    it('recognizes a sparse diagonal move that crosses the marker before ending above it', () => {
        expect(isPointerPathPastHeadingMarker(
            markerRect,
            { clientX: 588, clientY: 571 },
            { clientX: 30, clientY: 505 },
            false,
        )).toBe(true);
    });

    it('stops including the marker when the pointer moves back to its right', () => {
        expect(isPointerPathPastHeadingMarker(
            markerRect,
            { clientX: 300, clientY: 570 },
            { clientX: 500, clientY: 570 },
            true,
        )).toBe(false);
    });

    it('does not retain the marker after leaving far outside the heading line', () => {
        expect(isPointerPathPastHeadingMarker(
            markerRect,
            { clientX: 500, clientY: 570 },
            { clientX: 4, clientY: 4 },
            false,
        )).toBe(false);
    });

    it('projects nearby vertical misses onto the heading line', () => {
        expect(projectPointerToHeadingLine(markerRect, {
            clientX: 488,
            clientY: 548,
        })).toEqual({ clientX: 488, clientY: 570.5 });
        expect(projectPointerToHeadingLine(markerRect, {
            clientX: 488,
            clientY: 500,
        })).toBeNull();
    });
});
