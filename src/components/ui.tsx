'use client';

import type { CSSProperties, ReactNode } from 'react';
import { colors } from '@/lib/theme';

/** Inline SVG stroke icon from a path spec (matches prototype icon style). */
export function Icon({
  path,
  size = 18,
  stroke = 'currentColor',
  width = 1.8,
  style,
}: {
  path: string;
  size?: number;
  stroke?: string;
  width?: number;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0, ...style }}>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Pill({
  label,
  color,
  bg,
  capitalize,
  fontSize = 11.5,
}: {
  label: string;
  color: string;
  bg: string;
  capitalize?: boolean;
  fontSize?: number;
}) {
  return (
    <span
      style={{
        fontSize,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 999,
        color,
        background: bg,
        textTransform: capitalize ? 'capitalize' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function Card({
  children,
  style,
  padding = '22px 24px',
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: string;
}) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small KPI stat card (dashboards). */
export function StatCard({
  label,
  value,
  hint,
  valueColor = colors.ink,
  serif = true,
  valueSize = 32,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  valueColor?: string;
  serif?: boolean;
  valueSize?: number;
}) {
  return (
    <Card padding="20px">
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontFamily: serif ? "'Lora',serif" : undefined,
          fontSize: valueSize,
          fontWeight: 700,
          color: valueColor,
          marginTop: 6,
        }}
      >
        {value}
      </div>
      {hint && <span style={{ fontSize: 12, color: colors.faint }}>{hint}</span>}
    </Card>
  );
}

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 10px',
  borderRadius: 9,
  border: `1px solid ${colors.border}`,
  fontSize: 13,
  outline: 'none',
};

export const labelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: colors.muted,
  display: 'block',
  marginBottom: 6,
};

export function fieldLabel(text: string) {
  return <label style={labelStyle}>{text}</label>;
}
