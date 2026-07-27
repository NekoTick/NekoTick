import { useI18n } from '@/lib/i18n';

export function ChatLoading() {
    const { t } = useI18n();
    const dotAnimationDelays = [
        'var(--vlaina-duration-0)',
        'var(--vlaina-duration-100)',
        'var(--vlaina-duration-200)',
    ];

    return (
        <div
            role="status"
            className="flex h-6 w-fit items-center space-x-1.5 self-start rounded-full min-w-0 select-none"
        >
            <span className="sr-only">{t('chat.waitingForResponse')}</span>
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes chat-loading-typing {
                    0%, 100% { opacity: var(--vlaina-opacity-40); transform: translateY(var(--vlaina-translate-0)); }
                    50% { opacity: var(--vlaina-opacity-100); transform: translateY(var(--vlaina-translate--2px)); }
                }
                .chat-loading-dot {
                    animation: chat-loading-typing var(--vlaina-duration-chat-typing) infinite var(--vlaina-ease-in-out);
                }
            `}} />
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="w-1.5 h-1.5 bg-[var(--vlaina-accent)] rounded-full chat-loading-dot"
                    style={{
                        animationDelay: dotAnimationDelays[i],
                    }}
                />
            ))}
        </div>
    );
}
