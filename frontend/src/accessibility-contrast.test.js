import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const tokenPairs = [
  ['ink on ground', '#14213D', '#F6F4EF', 'normal'],
  ['muted on card', '#4B5572', '#FFFFFF', 'normal'],
  ['muted on primary tint', '#4B5572', '#E4E7FB', 'normal'],
  ['page description on ground', '#59647B', '#F6F4EF', 'normal'],
  ['primary button text', '#FFFFFF', '#3B4BDB', 'component'],
  ['primary hover text', '#FFFFFF', '#2D3CBD', 'component'],
  ['disabled primary text', '#FFFFFF', '#56617A', 'component'],
  ['disabled secondary text', '#14213D', '#E4E7FB', 'component'],
  ['amber text on tint', '#6B4400', '#FCE9C4', 'normal'],
];

describe('shared design token contrast', () => {
  it('keeps every text and component token pair accessible', () => {
    for (const [name, foreground, background, kind] of tokenPairs) {
      const minimum = kind === 'normal' ? 4.5 : 3;
      expect(
        contrastRatio(foreground, background),
        `${name}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('does not reduce card text contrast during the entrance animation', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('./styles.css', import.meta.url)),
      'utf8',
    );
    const animation = stylesheet.match(/@keyframes arrive\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(animation).toBeTruthy();
    expect(animation).not.toMatch(/opacity\s*:/);
  });
});
