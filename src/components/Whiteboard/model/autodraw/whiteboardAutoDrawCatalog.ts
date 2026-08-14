import type { ReactElement } from 'react';
import {
  Anchor, Apple, Armchair, Baby, Balloon, Bike, Bird, BookOpen, Bus, Cake,
  Camera, Car, Cat, Clock, Cloud, Coffee, Crown, Dog, Eye, Fish, Flower2,
  Gamepad2, Gift, Guitar, Headphones, Heart, House, Key, Lightbulb, Moon,
  Mountain, Palette, Phone, Plane, Rocket, Sailboat, Shirt, Smile, Snowflake,
  Sun, TreePine, Umbrella, Watch,
  type IconNode,
  type LucideIcon,
} from 'lucide-react';
import type { WhiteboardAutoDrawIcon } from './whiteboardAutoDrawTypes';

export interface WhiteboardAutoDrawCatalogEntry {
  icon: WhiteboardAutoDrawIcon;
  label: string;
  nodes: IconNode;
}

type LucideIconWithRender = LucideIcon & {
  render: (props: Record<string, never>, ref: null) => ReactElement<{ iconNode: IconNode }>;
};

const iconSources: Array<[WhiteboardAutoDrawIcon, string, LucideIcon]> = [
  ['house', 'House', House],
  ['tree', 'Tree', TreePine],
  ['flower', 'Flower', Flower2],
  ['car', 'Car', Car],
  ['bike', 'Bicycle', Bike],
  ['plane', 'Airplane', Plane],
  ['sailboat', 'Boat', Sailboat],
  ['fish', 'Fish', Fish],
  ['cat', 'Cat', Cat],
  ['dog', 'Dog', Dog],
  ['bird', 'Bird', Bird],
  ['smile', 'Face', Smile],
  ['eye', 'Eye', Eye],
  ['lightbulb', 'Light bulb', Lightbulb],
  ['umbrella', 'Umbrella', Umbrella],
  ['coffee', 'Cup', Coffee],
  ['camera', 'Camera', Camera],
  ['phone', 'Phone', Phone],
  ['book-open', 'Book', BookOpen],
  ['armchair', 'Chair', Armchair],
  ['clock', 'Clock', Clock],
  ['key', 'Key', Key],
  ['shirt', 'Shirt', Shirt],
  ['sun', 'Sun', Sun],
  ['moon', 'Moon', Moon],
  ['cloud', 'Cloud', Cloud],
  ['heart', 'Heart', Heart],
  ['apple', 'Apple', Apple],
  ['cake', 'Cake', Cake],
  ['anchor', 'Anchor', Anchor],
  ['baby', 'Baby', Baby],
  ['balloon', 'Balloon', Balloon],
  ['bus', 'Bus', Bus],
  ['crown', 'Crown', Crown],
  ['gamepad', 'Game controller', Gamepad2],
  ['gift', 'Gift', Gift],
  ['guitar', 'Guitar', Guitar],
  ['headphones', 'Headphones', Headphones],
  ['mountain', 'Mountain', Mountain],
  ['palette', 'Palette', Palette],
  ['rocket', 'Rocket', Rocket],
  ['snowflake', 'Snowflake', Snowflake],
  ['watch', 'Watch', Watch],
];

export const WHITEBOARD_AUTODRAW_CATALOG: WhiteboardAutoDrawCatalogEntry[] = iconSources.map(
  ([icon, label, component]) => ({
    icon,
    label,
    nodes: (component as LucideIconWithRender).render({}, null).props.iconNode,
  }),
);

const entriesByIcon = new Map(WHITEBOARD_AUTODRAW_CATALOG.map((entry) => [entry.icon, entry]));

export function getWhiteboardAutoDrawCatalogEntry(icon: WhiteboardAutoDrawIcon): WhiteboardAutoDrawCatalogEntry {
  return entriesByIcon.get(icon)!;
}
