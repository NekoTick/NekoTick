import { describe, expect, it, vi } from 'vitest';
import { createDesktopAuthPersistence } from '../../electron/accountAuthPersistence.mjs';

describe('desktop account auth persistence', () => {
  it('normalizes sign-in result identity before storing credentials', async () => {
    const writeStoredAccountCredentials = vi.fn(async () => undefined);
    const persistence = createDesktopAuthPersistence({
      readDesktopSessionIdentity: vi.fn(),
      writeStoredAccountCredentials,
    });

    await expect(persistence.persistDesktopAuthResult('google', {
      success: true,
      appSessionToken: ' nts_session ',
      provider: 'google',
      username: ' alice ',
      primaryEmail: ' alice@example.com ',
      avatarUrl: 'http://127.0.0.1/avatar.png',
      membershipTier: 'pro',
      membershipName: ' Pro ',
      budget: {
        active: true,
        usedPercent: 25,
        remainingPercent: 75,
        status: 'normal',
      },
    })).resolves.toMatchObject({
      success: true,
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
      budget: {
        active: true,
        usedPercent: 25,
        remainingPercent: 75,
        status: 'normal',
      },
    });

    expect(writeStoredAccountCredentials).toHaveBeenCalledWith(expect.objectContaining({
      appSessionToken: 'nts_session',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    }));
  });

  it('reports when secure storage could not persist the session', async () => {
    const persistence = createDesktopAuthPersistence({
      readDesktopSessionIdentity: vi.fn(),
      writeStoredAccountCredentials: vi.fn(async () => false),
    });

    await expect(persistence.persistDesktopAuthResult('google', {
      success: true,
      appSessionToken: 'nts_session',
      provider: 'google',
      username: 'alice',
    })).resolves.toMatchObject({
      success: true,
      persistent: false,
    });
  });
});
