export interface HeadingMarkerHitRect {
    bottom: number;
    right: number;
    top: number;
}

export interface HeadingPointerPoint {
    clientX: number;
    clientY: number;
}

export function getHeadingMarkerHitRect(marker: HTMLElement): HeadingMarkerHitRect {
    const { bottom, right, top } = marker.getBoundingClientRect();
    return { bottom, right, top };
}

function getVerticalTolerance(rect: HeadingMarkerHitRect): number {
    return Math.max(4, (rect.bottom - rect.top) * 0.15);
}

function isWithinMarkerBand(rect: HeadingMarkerHitRect, clientY: number): boolean {
    const tolerance = getVerticalTolerance(rect);
    return clientY >= rect.top - tolerance && clientY <= rect.bottom + tolerance;
}

export function isPointerPathPastHeadingMarker(
    markerRect: HeadingMarkerHitRect,
    previousPoint: HeadingPointerPoint | null,
    point: HeadingPointerPoint,
    wasPastMarker: boolean,
): boolean {
    if (point.clientX > markerRect.right) return false;
    const lineHeight = markerRect.bottom - markerRect.top;
    if (
        point.clientY < markerRect.top - lineHeight * 1.5
        || point.clientY > markerRect.bottom + lineHeight * 1.5
    ) return false;
    if (isWithinMarkerBand(markerRect, point.clientY)) return true;
    if (!previousPoint) return false;
    if (wasPastMarker && previousPoint.clientX <= markerRect.right) return true;
    if (
        previousPoint.clientX <= markerRect.right
        || point.clientX >= previousPoint.clientX
    ) return false;

    const crossingRatio = (markerRect.right - previousPoint.clientX)
        / (point.clientX - previousPoint.clientX);
    if (crossingRatio < 0 || crossingRatio > 1) return false;
    const crossingY = previousPoint.clientY
        + (point.clientY - previousPoint.clientY) * crossingRatio;
    return isWithinMarkerBand(markerRect, crossingY);
}

export function projectPointerToHeadingLine(
    markerRect: HeadingMarkerHitRect,
    point: HeadingPointerPoint,
): HeadingPointerPoint | null {
    const lineHeight = markerRect.bottom - markerRect.top;
    if (
        point.clientY < markerRect.top - lineHeight / 2
        || point.clientY > markerRect.bottom + lineHeight / 2
    ) return null;
    return {
        clientX: point.clientX,
        clientY: markerRect.top + lineHeight / 2,
    };
}
