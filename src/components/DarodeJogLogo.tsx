import React from 'react';
import logoImg from '../image/logo.jpeg';

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;

export interface TaskLogoProps {
  size?: LogoSize;
  width?: number | string;
  height?: number | string;
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  textColor?: string;
  subtitleColor?: string;
  theme?: 'dark' | 'light' | 'auto';
  shape?: 'rounded' | 'circle' | 'pill' | 'natural';
  alt?: string;
}

const sizeHeightMap: Record<string, number> = {
  sm: 22,
  md: 28,
  lg: 38,
  xl: 48,
  '2xl': 64,
};

export const BrickFourLogo: React.FC<TaskLogoProps> = ({
  size = 'md',
  width,
  height,
  className = '',
  imgClassName = '',
  showText = false,
  textColor = 'text-slate-900',
  subtitleColor = 'text-indigo-600',
  theme = 'auto',
  shape = 'rounded',
  alt = 'Brick Four',
}) => {
  const pixelHeight =
    height !== undefined
      ? typeof height === 'number'
        ? height
        : parseInt(String(height), 10) || 28
      : typeof size === 'number'
      ? size
      : sizeHeightMap[size] || 28;

  const shapeClasses =
    shape === 'rounded'
      ? 'rounded-lg'
      : shape === 'circle'
      ? 'rounded-full'
      : shape === 'pill'
      ? 'rounded-xl'
      : '';

  // Theme styling for the background badge around the logo
  // Padding ensures the logo's red squares and lettering are never cut by the rounded border
  const containerClasses =
    theme === 'dark'
      ? 'bg-white px-2 py-1 shadow-sm border border-slate-200/50 inline-flex items-center justify-center shrink-0'
      : 'bg-white px-2 py-1 shadow-xs border border-slate-200/80 inline-flex items-center justify-center shrink-0';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none min-w-0 ${className}`}>
      {/* Logo Image Container with comfortable padding to prevent any edge clipping */}
      <div
        className={`${containerClasses} ${shapeClasses} transition-transform duration-200 hover:scale-102`}
        style={{
          height: `${pixelHeight + 10}px`,
        }}
      >
        <img
          src={logoImg}
          alt={alt}
          style={{
            height: `${pixelHeight}px`,
            width: width ? (typeof width === 'number' ? `${width}px` : width) : 'auto',
          }}
          className={`object-contain block max-h-full max-w-full ${imgClassName}`}
          loading="eager"
        />
      </div>

      {/* Brand & System Title (uses whitespace-nowrap to strictly prevent text wrapping into vertical letters) */}
      {showText && (
        <div className="flex flex-col text-left justify-center min-w-0">
          <span className={`font-bold tracking-tight text-xs sm:text-sm leading-tight whitespace-nowrap ${textColor}`}>
            Task Management
          </span>
          <span className={`text-[9px] font-semibold tracking-wider uppercase whitespace-nowrap mt-0.5 ${subtitleColor}`}>
            Operations & Workflow
          </span>
        </div>
      )}
    </div>
  );
};

// Aliases for backwards compatibility
export const TaskManagementLogo = BrickFourLogo;
export const DarodeJogLogo = BrickFourLogo;
export default BrickFourLogo;
