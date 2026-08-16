import { useAccountSessionStore } from '@/stores/accountSession';

export function useUserAvatar() {
    const provider = useAccountSessionStore((state) => state.provider);
    const avatarUrl = useAccountSessionStore((state) => state.avatarUrl);
    const localAvatarUrl = useAccountSessionStore((state) => state.localAvatarUrl);

    if (provider !== 'google') {
        return null;
    }

    return localAvatarUrl || avatarUrl || null;
}
