import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1a1a1a',
    textSecondary: '#6b6b6b',
    background: '#fdf6ec',
    surface: '#fef9f0',
    card: '#ffffff',
    border: '#e8dcc8',
    tint: '#c47f17',
    icon: '#8a7a66',
    tabIconDefault: '#8a7a66',
    tabIconSelected: '#c47f17',
    success: '#2d8a4e',
    danger: '#d93025',
  },
  dark: {
    text: '#e5e5e5',
    textSecondary: '#a0a0a0',
    background: '#000000',
    surface: '#111111',
    card: '#1a1a1a',
    border: '#2a2a2a',
    tint: '#e0a84c',
    icon: '#888888',
    tabIconDefault: '#888888',
    tabIconSelected: '#e0a84c',
    success: '#4ade80',
    danger: '#f87171',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
