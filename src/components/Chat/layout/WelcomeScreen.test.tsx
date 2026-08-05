import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';

describe('WelcomeScreen', () => {
  it('keeps the desktop welcome presentation unchanged by default', () => {
    const { container } = render(<WelcomeScreen />);

    const welcome = container.querySelector('[data-chat-welcome="true"]');
    const heading = screen.getByRole('heading');
    expect(welcome).not.toHaveAttribute('data-chat-welcome-presentation');
    expect(heading).toHaveClass('text-3xl', 'font-bold', 'hover:rotate-3');
    expect(heading).toHaveTextContent('Ciallo~(∠・ω<)⌒★');
  });

  it('uses a quieter non-animated structure for mobile', () => {
    const { container } = render(<WelcomeScreen presentation="mobile" />);

    const welcome = container.querySelector('[data-chat-welcome="true"]');
    const heading = screen.getByRole('heading');
    expect(welcome).toHaveAttribute('data-chat-welcome-presentation', 'mobile');
    expect(welcome).toHaveClass('mobile-chat-welcome');
    expect(heading).toHaveClass('mobile-chat-welcome__title');
    expect(heading).not.toHaveClass('hover:rotate-3');
    expect(welcome).toHaveTextContent('VlainaAI');
  });
});
