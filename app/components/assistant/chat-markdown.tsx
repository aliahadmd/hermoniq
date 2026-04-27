import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { useThemeColor } from '@/hooks/use-theme-color';

interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const linkColor = useThemeColor({ light: '#8A4F00', dark: '#FFD17A' }, 'tint');
  const codeText = useThemeColor({ light: '#2B1B0A', dark: '#F5E6CF' }, 'text');
  const codeBlockBg = useThemeColor({ light: '#F7EAD6', dark: '#24272F' }, 'surface');
  const inlineCodeBg = useThemeColor({ light: '#F1E2CC', dark: '#2A2D36' }, 'surface');
  const [deferredContent, setDeferredContent] = useState(
    Platform.OS === 'android' ? '' : content,
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setDeferredContent(content);
      return;
    }

    // Avoid an Android native TextView crash by applying markdown after mount.
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) {
        setDeferredContent(content);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [content]);

  const markdownStyle: MarkdownStyle = {
    paragraph: {
      color: text,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 8,
    },
    h1: {
      color: text,
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 8,
    },
    h2: {
      color: text,
      fontSize: 19,
      fontWeight: '700',
      marginBottom: 8,
    },
    h3: {
      color: text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 8,
    },
    list: {
      color: text,
      markerColor: textSecondary,
      bulletColor: textSecondary,
      markerFontWeight: '600',
      gapWidth: 8,
      marginTop: 0,
      marginBottom: 8,
    },
    link: {
      color: linkColor,
      underline: true,
    },
    strong: {
      color: text,
    },
    em: {
      color: text,
    },
    code: {
      color: codeText,
      backgroundColor: inlineCodeBg,
      borderColor: border,
    },
    codeBlock: {
      color: codeText,
      backgroundColor: codeBlockBg,
      borderColor: border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      padding: 10,
      lineHeight: 21,
      marginBottom: 8,
    },
    blockquote: {
      color: text,
      borderColor: border,
      borderWidth: 2,
      gapWidth: 10,
      backgroundColor: codeBlockBg,
    },
    thematicBreak: {
      color: border,
      height: 1,
      marginTop: 10,
      marginBottom: 10,
    },
  };

  const onLinkPress = (event: LinkPressEvent) => {
    if (!event.url) return;
    Linking.openURL(event.url).catch(() => {});
  };

  return (
    <EnrichedMarkdownText
      markdown={deferredContent}
      markdownStyle={markdownStyle}
      onLinkPress={onLinkPress}
      selectable={Platform.OS !== 'android'}
    />
  );
}
