export const WHITEBOARD_AUTODRAW_ICONS = [
  'anchor', 'apple', 'armchair', 'baby', 'balloon', 'bike', 'bird', 'book-open',
  'bus', 'cake', 'camera', 'car', 'cat', 'clock', 'cloud', 'coffee', 'crown',
  'dog', 'eye', 'fish', 'flower', 'gamepad', 'gift', 'guitar', 'headphones',
  'heart', 'house', 'key', 'lightbulb', 'moon', 'mountain', 'palette', 'phone',
  'plane', 'rocket', 'sailboat', 'shirt', 'smile', 'snowflake', 'sun', 'tree',
  'umbrella', 'watch',
] as const;

export type WhiteboardAutoDrawIcon = typeof WHITEBOARD_AUTODRAW_ICONS[number];

export function isWhiteboardAutoDrawIcon(value: unknown): value is WhiteboardAutoDrawIcon {
  return typeof value === 'string' && (WHITEBOARD_AUTODRAW_ICONS as readonly string[]).includes(value);
}
