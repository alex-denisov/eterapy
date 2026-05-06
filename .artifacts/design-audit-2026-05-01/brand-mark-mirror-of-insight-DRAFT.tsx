'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * The "Mirror of Insight" - ETerapy V5 Visionary Logo
 * 
 * Concept: 
 * A single, centered point of clarity that radiates outward. 
 * Instead of static shapes, it uses layered, breathing light circles 
 * that symbolize the process of self-discovery: uncovering layers 
 * to reach the core truth.
 */
export const HaloSymbol = ({ className = '', size = 120 }: { className?: string; size?: number }) => {
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`} 
      style={{ width: size, height: size }}
    >
      {/* Deep Atmospheric Glow (The Subconscious) */}
      <div className="absolute inset-0 bg-brand-lavender/5 blur-[60px] rounded-full" />
      
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <radialGradient id="insight-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD79A" />
            <stop offset="100%" stopColor="#D4A15A" />
          </radialGradient>
          
          <filter id="focus-blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>

          {/* Liquid filter for organic "petal" feel in a programmatic way */}
          <filter id="liquid-focus">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>

        {/* Outer Ring - The Search for Self */}
        <motion.circle
          cx="60"
          cy="60"
          r="48"
          stroke="white"
          strokeWidth="0.25"
          strokeDasharray="1 10"
          opacity="0.2"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        />

        {/* Middle Layers - Reflection */}
        <g filter="url(#liquid-focus)">
          <motion.circle
            cx="60"
            cy="60"
            r="32"
            fill="#8E89D6"
            opacity="0.05"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx="60"
            cy="60"
            r="24"
            fill="#D4A15A"
            opacity="0.05"
            animate={{ scale: [1.1, 1, 1.1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
        </g>

        {/* Inner Light - The Discovery (Self) */}
        <g filter="url(#focus-blur)">
          <motion.circle
            cx="60"
            cy="60"
            r="8"
            fill="url(#insight-core)"
            animate={{ 
              scale: [1, 1.2, 1],
              filter: ["blur(2px)", "blur(5px)", "blur(2px)"]
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle cx="60" cy="60" r="1.5" fill="white" />
        </g>
      </svg>
    </div>
  );
};

export const BrandLogo = ({ 
  className = '', 
  height = 32 
}: { 
  className?: string; 
  height?: number;
}) => {
  return (
    <div className={`flex items-center gap-4 ${className}`} style={{ height }}>
      <HaloSymbol size={height * 2.2} />
      <div className="flex flex-col justify-center">
        <span 
          className="text-primary tracking-[0.2em] font-medium leading-none" 
          style={{ fontSize: height * 0.7, fontFamily: 'var(--font-heading)' }}
        >
          ETERAPY
        </span>
        <span 
          className="text-brand-soft-gold opacity-40 font-bold tracking-[0.5em] mt-1 uppercase"
          style={{ fontSize: height * 0.22 }}
        >
          The Path Within
        </span>
      </div>
    </div>
  );
};

export const VectorBrandLogo = BrandLogo;

/**
 * Backwards-compatible aliases so existing call sites keep building during
 * the M19 redesign. B179 replaces these with first-class variants.
 */
export const HaloMark = ({
  size = 56,
  className = '',
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  priority?: boolean;
}) => <HaloSymbol size={size} className={className} />;

export const BrandSignature = ({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) => (
  <BrandLogo className={className} height={compact ? 28 : 36} />
);

