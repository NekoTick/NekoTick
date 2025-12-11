import { useState, useRef, useEffect } from 'react';
import {
  // Activity & Sports
  Barbell, Target, TrendUp, Lightning, Trophy, Medal, Flag, FlagBanner, Pulse, Fire,
  Footprints, Sneaker, SwimmingPool, Basketball, Mountains, Bicycle,
  SoccerBall, Football, TennisBall, Volleyball, Baseball, BowlingBall, BoxingGlove, FlyingSaucer,
  Parachute, Strategy, Confetti, PersonSimpleRun, PersonSimpleWalk, PersonSimpleHike, PersonSimpleBike,
  
  // Health & Medical
  Heart, Heartbeat, Brain, Moon, Sun, Smiley, Sparkle, HandSoap, Virus,
  Bed, Pill, FirstAidKit, Syringe, Thermometer, Stethoscope, Bandaids, Tooth, Toilet, GenderMale, GenderFemale,
  
  // Food & Drink
  Coffee, TeaBag, ForkKnife, Pizza, Hamburger, Cookie, IceCream,
  Martini, Wine, BeerBottle, BeerStein, Brandy, Cake, Popcorn, CookingPot, ChefHat,
  AppleLogo, Carrot, Egg, FishSimple, Pepper, Grains, BowlFood, 
  Cherries,

  // Work, Tech & Education
  Briefcase, GraduationCap, Student, Book, BookOpen, Books, Pen, PenNib, Code, Laptop, Desktop, Monitor,
  Mouse, MouseSimple, Keyboard, DeviceTablet, DeviceMobile,
  Calculator, ChartBar, ChartPie, ChartLine, PresentationChart,
  Rocket, Lightbulb, Bank, Robot, Cpu, Circuitry, WifiHigh, BatteryCharging,
  HardDrives, Usb, Printer, Megaphone, Broadcast, Headset, Webcam, ProjectorScreen,
  Folder, File, Archive, Clipboard, IdentificationCard, Newspaper,

  // Life, Arts & Media
  House, HouseLine, Camera, Aperture, Image, ShoppingBag, ShoppingCart, Gift, Ticket,
  Armchair, Chair, Couch, Baby, FilmStrip, FilmSlate, Palette, Ghost, Skull, ChatCircle,
  PaintBrush, Pencil, Ruler, Guitar, PianoKeys, Microphone, MicrophoneStage, Headphones, MusicNote, MusicNotes,
  GameController, Joystick, DiceFive, Spade, Club,
  Television, Radio, SpeakerHifi, CassetteTape, Disc, VinylRecord, MagicWand, Crown, Sword, Shield,
  PuzzlePiece, Balloon,

  // Nature, Animals & Weather
  Plant, Flower, FlowerLotus, Leaf, Tree, TreePalm, TreeEvergreen, Cactus,
  Drop, Waves, Wind, CloudRain, CloudLightning, CloudSun, CloudFog, SunHorizon,
  MoonStars, Planet, ShootingStar, Snowflake, Rainbow, FireSimple, Umbrella,
  Cat, Dog, Bird, Fish, PawPrint, Butterfly, Rabbit, Horse, Cow,

  // Travel & Maps
  Airplane, AirplaneTilt, Car, CarProfile, Jeep, Bus, Train, Subway, Tram, Truck,
  Motorcycle, Scooter, Boat, Sailboat, Anchor,
  MapTrifold, MapPin, Compass, Globe, Suitcase, Backpack, Binoculars,
  TrafficCone, TrafficSignal, Signpost, Bridge, GasPump, Taxi,

  // Clothing & Fashion
  TShirt, Hoodie, CoatHanger, Dress, HighHeel, Eyeglasses, Sunglasses, BaseballCap, Tote, Handbag, Watch as WatchAccessory, Diamond,

  // Tools, Objects & Finance
  Clock, Alarm, Hourglass, CalendarBlank, CalendarCheck,
  Wrench, Hammer, Screwdriver, Key, Lock, LockKeyOpen, Bell, Gear,
  Tag, Paperclip, PushPin, Scissors, Trash, Broom, Shower, Bathtub, Lamp, Flashlight,
  CurrencyDollar, CurrencyEur, CurrencyJpy, CurrencyGbp, CurrencyBtc, PiggyBank, CreditCard, Wallet, Coin,
  Magnet, Envelope, Package,

  // Misc
  type Icon as PhosphorIcon,
  CaretLeft, Prohibit
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

// Categorized Icons
// NOTE: We do NOT include the "None" option here. It is handled purely in the UI.
const ICON_CATEGORIES = [
  {
    name: 'Activity',
    icons: [
      { name: 'dumbbell', icon: Barbell }, // Fallback to Barbell
      { name: 'activity', icon: Pulse },
      { name: 'flame', icon: Fire },
      { name: 'target', icon: Target },
      { name: 'trending', icon: TrendUp },
      { name: 'strategy', icon: Strategy },
      { name: 'trophy', icon: Trophy },
      { name: 'award', icon: Medal },
      { name: 'flag', icon: Flag },
      { name: 'banner', icon: FlagBanner },
      { name: 'zap', icon: Lightning },
      { name: 'confetti', icon: Confetti },
      { name: 'steps', icon: Footprints },
      { name: 'run', icon: Sneaker },
      { name: 'jog', icon: PersonSimpleRun },
      { name: 'walk', icon: PersonSimpleWalk },
      { name: 'hike', icon: PersonSimpleHike },
      { name: 'cycle', icon: PersonSimpleBike },
      { name: 'swim', icon: SwimmingPool },
      { name: 'mountain', icon: Mountains },
      { name: 'bike', icon: Bicycle },
      { name: 'soccer', icon: SoccerBall },
      { name: 'football', icon: Football },
      { name: 'basketball', icon: Basketball },
      { name: 'tennis', icon: TennisBall },
      { name: 'volley', icon: Volleyball },
      { name: 'baseball', icon: Baseball },
      { name: 'bowling', icon: BowlingBall },
      { name: 'boxing', icon: BoxingGlove },
      { name: 'ufo', icon: FlyingSaucer },
      { name: 'chute', icon: Parachute },
    ]
  },
  {
    name: 'Health',
    icons: [
      { name: 'heart', icon: Heart },
      { name: 'beat', icon: Heartbeat },
      { name: 'brain', icon: Brain },
      { name: 'smile', icon: Smiley },
      { name: 'sparkle', icon: Sparkle },
      { name: 'moon', icon: Moon },
      { name: 'sun', icon: Sun },
      { name: 'sleep', icon: Bed },
      { name: 'pill', icon: Pill },
      { name: 'firstaid', icon: FirstAidKit },
      { name: 'syringe', icon: Syringe },
      { name: 'thermo', icon: Thermometer },
      { name: 'scope', icon: Stethoscope },
      { name: 'bandaid', icon: Bandaids },
      { name: 'tooth', icon: Tooth },
      { name: 'soap', icon: HandSoap },
      { name: 'virus', icon: Virus },
      { name: 'male', icon: GenderMale },
      { name: 'female', icon: GenderFemale },
      { name: 'toilet', icon: Toilet },
    ]
  },
  {
    name: 'Food',
    icons: [
      { name: 'coffee', icon: Coffee },
      { name: 'tea', icon: TeaBag },
      { name: 'utensils', icon: ForkKnife },
      { name: 'chef', icon: ChefHat },
      { name: 'cook', icon: CookingPot },
      { name: 'pizza', icon: Pizza },
      { name: 'burger', icon: Hamburger },
      { name: 'bowl', icon: BowlFood },
      { name: 'cookie', icon: Cookie },
      { name: 'icecream', icon: IceCream },
      { name: 'cake', icon: Cake },
      { name: 'popcorn', icon: Popcorn },
      { name: 'apple', icon: AppleLogo },
      { name: 'carrot', icon: Carrot },
      { name: 'egg', icon: Egg },
      { name: 'fish-food', icon: FishSimple },
      { name: 'meat', icon: Grains }, // Fallback for meat
      { name: 'pepper', icon: Pepper },
      { name: 'cherry', icon: Cherries },
      { name: 'martini', icon: Martini },
      { name: 'wine', icon: Wine },
      { name: 'beer', icon: BeerBottle },
      { name: 'stein', icon: BeerStein },
      { name: 'brandy', icon: Brandy },
    ]
  },
  {
    name: 'Work & Edu',
    icons: [
      { name: 'briefcase', icon: Briefcase },
      { name: 'grad', icon: GraduationCap },
      { name: 'student', icon: Student },
      { name: 'book', icon: Book },
      { name: 'openbook', icon: BookOpen },
      { name: 'library', icon: Books },
      { name: 'pen', icon: Pen },
      { name: 'nib', icon: PenNib },
      { name: 'code', icon: Code },
      { name: 'laptop', icon: Laptop },
      { name: 'desktop', icon: Desktop },
      { name: 'monitor', icon: Monitor },
      { name: 'keyboard', icon: Keyboard },
      { name: 'mouse', icon: Mouse },
      { name: 'mouse-s', icon: MouseSimple },
      { name: 'tablet', icon: DeviceTablet },
      { name: 'phone', icon: DeviceMobile },
      { name: 'calc', icon: Calculator },
      { name: 'chart', icon: ChartBar },
      { name: 'pie', icon: ChartPie },
      { name: 'line', icon: ChartLine },
      { name: 'pres', icon: PresentationChart },
      { name: 'rocket', icon: Rocket },
      { name: 'idea', icon: Lightbulb },
      { name: 'bank', icon: Bank },
      { name: 'robot', icon: Robot },
      { name: 'cpu', icon: Cpu },
      { name: 'chip', icon: Circuitry },
      { name: 'wifi', icon: WifiHigh },
      { name: 'battery', icon: BatteryCharging },
      { name: 'drive', icon: HardDrives },
      { name: 'usb', icon: Usb },
      { name: 'printer', icon: Printer },
      { name: 'mega', icon: Megaphone },
      { name: 'live', icon: Broadcast },
      { name: 'headset', icon: Headset },
      { name: 'webcam', icon: Webcam },
      { name: 'projector', icon: ProjectorScreen },
      { name: 'folder', icon: Folder },
      { name: 'file', icon: File },
      { name: 'archive', icon: Archive },
      { name: 'board', icon: Clipboard },
      { name: 'id', icon: IdentificationCard },
      { name: 'news', icon: Newspaper },
    ]
  },
  {
    name: 'Life & Arts',
    icons: [
      { name: 'home', icon: House },
      { name: 'home-l', icon: HouseLine },
      { name: 'camera', icon: Camera },
      { name: 'aperture', icon: Aperture },
      { name: 'image', icon: Image },
      { name: 'shopping', icon: ShoppingBag },
      { name: 'cart', icon: ShoppingCart },
      { name: 'gift', icon: Gift },
      { name: 'ticket', icon: Ticket },
      { name: 'relax', icon: Armchair },
      { name: 'chair', icon: Chair },
      { name: 'couch', icon: Couch },
      { name: 'baby', icon: Baby },
      { name: 'movie', icon: FilmStrip },
      { name: 'slate', icon: FilmSlate },
      { name: 'tv', icon: Television },
      { name: 'radio', icon: Radio },
      { name: 'art', icon: Palette },
      { name: 'ghost', icon: Ghost },
      { name: 'skull', icon: Skull },
      { name: 'game', icon: GameController },
      { name: 'joy', icon: Joystick },
      { name: 'dice', icon: DiceFive },
      { name: 'spade', icon: Spade },
      { name: 'club', icon: Club },
      { name: 'magic', icon: MagicWand },
      { name: 'chat', icon: ChatCircle },
      { name: 'paint', icon: PaintBrush },
      { name: 'draw', icon: Pencil },
      { name: 'ruler', icon: Ruler },
      { name: 'guitar', icon: Guitar },
      { name: 'piano', icon: PianoKeys },
      { name: 'mic', icon: Microphone },
      { name: 'stage', icon: MicrophoneStage },
      { name: 'headphones', icon: Headphones },
      { name: 'music', icon: MusicNote },
      { name: 'notes', icon: MusicNotes },
      { name: 'speaker', icon: SpeakerHifi },
      { name: 'cassette', icon: CassetteTape },
      { name: 'vinyl', icon: VinylRecord },
      { name: 'disc', icon: Disc },
      { name: 'crown', icon: Crown },
      { name: 'sword', icon: Sword },
      { name: 'shield', icon: Shield },
      { name: 'puzzle', icon: PuzzlePiece },
      { name: 'balloon', icon: Balloon },
    ]
  },
  {
    name: 'Nature',
    icons: [
      { name: 'plant', icon: Plant },
      { name: 'flower', icon: Flower },
      { name: 'lotus', icon: FlowerLotus },
      { name: 'tree', icon: Tree },
      { name: 'palm', icon: TreePalm },
      { name: 'pine', icon: TreeEvergreen },
      { name: 'cactus', icon: Cactus },
      { name: 'leaf', icon: Leaf },
      { name: 'sun-h', icon: SunHorizon },
      { name: 'drop', icon: Drop },
      { name: 'waves', icon: Waves },
      { name: 'wind', icon: Wind },
      { name: 'rain', icon: CloudRain },
      { name: 'cloud-sun', icon: CloudSun },
      { name: 'snow', icon: Snowflake },
      { name: 'storm', icon: CloudLightning },
      { name: 'fog', icon: CloudFog },
      { name: 'umbrella', icon: Umbrella },
      { name: 'rainbow', icon: Rainbow },
      { name: 'fire', icon: FireSimple },
      { name: 'moon-s', icon: MoonStars },
      { name: 'planet', icon: Planet },
      { name: 'star', icon: ShootingStar },
      { name: 'cat', icon: Cat },
      { name: 'dog', icon: Dog },
      { name: 'bird', icon: Bird },
      { name: 'fish', icon: Fish },
      { name: 'paw', icon: PawPrint },
      { name: 'butterfly', icon: Butterfly },
      { name: 'rabbit', icon: Rabbit },
      { name: 'horse', icon: Horse },
      { name: 'cow', icon: Cow },
    ]
  },
  {
    name: 'Travel',
    icons: [
      { name: 'plane', icon: Airplane },
      { name: 'fly', icon: AirplaneTilt },
      { name: 'car', icon: Car },
      { name: 'car-s', icon: CarProfile },
      { name: 'taxi', icon: Taxi },
      { name: 'bus', icon: Bus },
      { name: 'train', icon: Train },
      { name: 'subway', icon: Subway },
      { name: 'tram', icon: Tram },
      { name: 'truck', icon: Truck },
      { name: 'moto', icon: Motorcycle },
      { name: 'scooter', icon: Scooter },
      { name: 'jeep', icon: Jeep },
      { name: 'bike', icon: Bicycle },
      { name: 'boat', icon: Boat },
      { name: 'ship', icon: Sailboat },
      { name: 'anchor', icon: Anchor },
      { name: 'map', icon: MapTrifold },
      { name: 'pin', icon: MapPin },
      { name: 'compass', icon: Compass },
      { name: 'globe', icon: Globe },
      { name: 'luggage', icon: Suitcase },
      { name: 'pack', icon: Backpack },
      { name: 'view', icon: Binoculars },
      { name: 'cone', icon: TrafficCone },
      { name: 'light', icon: TrafficSignal },
      { name: 'sign', icon: Signpost },
      { name: 'bridge', icon: Bridge },
      { name: 'gas', icon: GasPump },
    ]
  },
  {
    name: 'Clothing',
    icons: [
      { name: 'tshirt', icon: TShirt },
      { name: 'hoodie', icon: Hoodie },
      { name: 'dress', icon: Dress },
      { name: 'hanger', icon: CoatHanger },
      { name: 'heels', icon: HighHeel },
      { name: 'glasses', icon: Eyeglasses },
      { name: 'shades', icon: Sunglasses },
      { name: 'cap', icon: BaseballCap },
      { name: 'tote', icon: Tote },
      { name: 'bag', icon: Handbag },
      { name: 'watch', icon: WatchAccessory },
      { name: 'diamond', icon: Diamond },
    ]
  },
  {
    name: 'Objects',
    icons: [
      { name: 'clock', icon: Clock },
      { name: 'alarm', icon: Alarm },
      { name: 'timer', icon: Hourglass },
      { name: 'calendar', icon: CalendarBlank },
      { name: 'check', icon: CalendarCheck },
      { name: 'wrench', icon: Wrench },
      { name: 'hammer', icon: Hammer },
      { name: 'driver', icon: Screwdriver },
      { name: 'key', icon: Key },
      { name: 'lock', icon: Lock },
      { name: 'unlock', icon: LockKeyOpen },
      { name: 'bell', icon: Bell },
      { name: 'gear', icon: Gear },
      { name: 'tag', icon: Tag },
      { name: 'clip', icon: Paperclip },
      { name: 'pin', icon: PushPin },
      { name: 'magnet', icon: Magnet },
      { name: 'cut', icon: Scissors },
      { name: 'trash', icon: Trash },
      { name: 'clean', icon: Broom },
      { name: 'shower', icon: Shower },
      { name: 'bath', icon: Bathtub },
      { name: 'lamp', icon: Lamp },
      { name: 'flash', icon: Flashlight },
      { name: 'dollar', icon: CurrencyDollar },
      { name: 'eur', icon: CurrencyEur },
      { name: 'jpy', icon: CurrencyJpy },
      { name: 'gbp', icon: CurrencyGbp },
      { name: 'btc', icon: CurrencyBtc },
      { name: 'piggy', icon: PiggyBank },
      { name: 'card', icon: CreditCard },
      { name: 'wallet', icon: Wallet },
      { name: 'coin', icon: Coin },
      { name: 'mail', icon: Envelope },
      { name: 'box', icon: Package },
    ]
  }
];

// Flatten for quick lookup
const ALL_ICONS = ICON_CATEGORIES.flatMap(c => c.icons);

export function getIconByName(name: string): PhosphorIcon | null {
  const found = ALL_ICONS.find(i => i.name === name);
  return found?.icon || null;
}

export function IconSelectionView({ value, onChange, onCancel }: { value?: string, onChange: (icon: string | undefined) => void, onCancel?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* 1. Minimal Header */}
      <div className="flex justify-start items-center mb-4 px-2 shrink-0 h-10">
        {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 -ml-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Back"
            >
              <CaretLeft weight="bold" className="size-5" />
            </button>
        )}
      </div>

      {/* 2. Pure Icon Grid */}
      <div className="
        flex-1 overflow-y-auto pb-8 -mx-4 px-4
        [&::-webkit-scrollbar]:w-1.5
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-zinc-100
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:hover:bg-zinc-300
        dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800
        dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700
      ">
        {ICON_CATEGORIES.map((category) => (
            <div key={category.name} className="mb-6">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest px-2 mb-3 sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md py-2 z-20">
                    {category.name}
                </div>
                <div className="grid grid-cols-5 gap-4 px-1">
                    {/* Only show "None" in the first category (Activity) for UX or just handle it separately? 
                       Actually, "None" is a global option. Let's keep it separate or put it at the very top.
                       The current design puts it in the grid. 
                       Let's put "None" at the start of the first category, or keep it as a special floating action?
                       The previous code had it as the first item in the grid manually.
                    */}
                    {category.name === 'Activity' && (
                        <button
                            onClick={() => onChange(undefined)}
                            className={`
                            group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                            ${!value 
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl scale-110 z-10' 
                                : 'bg-transparent text-zinc-300 dark:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-110'
                            }
                            `}
                            title="No Icon"
                        >
                            <Prohibit 
                            className={`transition-transform duration-300 ${!value ? 'size-6 opacity-100' : 'size-6 opacity-40 group-hover:opacity-100'}`}
                            weight={!value ? "bold" : "regular"}
                            />
                        </button>
                    )}

                    {category.icons.map(({ name, icon: Icon }) => {
                        const isSelected = value === name;
                        return (
                        <button
                            key={name}
                            onClick={() => onChange(name)}
                            className={`
                            group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                            ${isSelected
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl scale-110 z-10' 
                                : 'bg-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-110'
                            }
                            `}
                            title={name}
                        >
                            <Icon 
                            className="size-7 transition-transform duration-300" 
                            weight={isSelected ? "duotone" : "light"}
                            />
                        </button>
                        );
                    })}
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}

interface IconPickerProps {
  value?: string;
  onChange: (icon: string | undefined) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const SelectedIcon = value ? getIconByName(value) : null;

  return (
    <div className="relative z-50">
      {/* Trigger Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={`
          relative w-14 h-14 flex items-center justify-center rounded-full transition-all duration-300
          ${SelectedIcon 
            ? 'bg-white dark:bg-zinc-800 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] ring-1 ring-black/5 dark:ring-white/10' 
            : 'bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-700 shadow-sm hover:shadow-md'
          }
        `}
      >
        {SelectedIcon ? (
          <div className="text-zinc-900 dark:text-zinc-100">
             <SelectedIcon className="size-6" weight="duotone" />
          </div>
        ) : (
          <Sparkle className="size-6 text-zinc-400 dark:text-zinc-500 opacity-80" weight="light" />
        )}
        
        {open && (
           <motion.div 
             layoutId="active-ring"
             className="absolute -inset-1 rounded-full border border-zinc-900/20 dark:border-zinc-100/20 opacity-100 pointer-events-none"
             initial={{ opacity: 0, scale: 0.8 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.8 }}
           />
        )}
      </motion.button>

      {/* Center Stage Icon Panel (Fixed Overlay) */}
      <AnimatePresence>
        {open && (
          <>
            {/* Invisible Backdrop to catch clicks */}
            <div 
                className="fixed inset-0 z-[60]" 
                onClick={() => setOpen(false)}
            />

            {/* The Floating Palette */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
              className="
                fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                w-[380px] max-h-[600px] 
                bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl 
                rounded-[2.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] 
                border border-white/40 dark:border-white/10
                overflow-hidden
                flex flex-col
              "
            >
              <div className="p-6 h-full overflow-hidden flex flex-col">
                 <IconSelectionView value={value} onChange={(v) => { onChange(v); setOpen(false); }} onCancel={() => setOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

