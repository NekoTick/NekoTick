import { Icon } from '@/components/ui/icons';

interface WelcomeScreenProps {
  presentation?: 'desktop' | 'mobile';
}

export function WelcomeScreen({ presentation = 'desktop' }: WelcomeScreenProps) {
  if (presentation === 'mobile') {
    return (
      <div
        data-chat-welcome="true"
        data-chat-welcome-presentation="mobile"
        className="mobile-chat-welcome"
      >
        <span className="mobile-chat-welcome__mark" aria-hidden="true">
          <Icon name="common.shootingStar" size="xl" />
        </span>
        <span className="mobile-chat-welcome__eyebrow">Vlaina</span>
        <h1 className="mobile-chat-welcome__title">AI</h1>
      </div>
    );
  }

  return (
    <div data-chat-welcome="true" className="mb-5 text-center">
        <h1 className="inline-block origin-center select-none text-3xl font-bold tracking-tight text-[var(--vlaina-sidebar-chat-text)] transition-transform duration-[var(--vlaina-duration-300)] ease-out hover:rotate-3 hover:scale-[var(--vlaina-scale-110)]">
            Ciallo<span className="text-[var(--vlaina-accent)]">~</span>(∠・ω&lt;)⌒<span className="text-[var(--vlaina-accent)]">★</span>
        </h1>
    </div>
  );
}
