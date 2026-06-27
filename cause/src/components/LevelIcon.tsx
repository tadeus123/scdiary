import type { FC } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export function LevelIcon({ levelId, size = 64 }: { levelId: string; size?: number }) {
  const icons: Record<string, FC<IconProps>> = {
    'red-light': RedLightIcon,
    'couch-protocol': CouchIcon,
    'first-principles': BrainIcon,
    'code-or-die': CodeIcon,
    'spark-of-life': SparkIcon,
    'first-coin': CoinIcon,
    'random-friend': FriendIcon,
    'makerspace': PrinterIcon,
    'factory-curiosity': FactoryIcon,
    'cad-monk': CadIcon,
    'dagobert-vault': DagobertIcon,
    'unitree-pilgrimage': PilgrimageIcon,
    'limb-zero': LimbIcon,
    'ros-whisperer': RosIcon,
    'legal-entity': LegalIcon,
    'ekko-quest': EkkoIcon,
    'blackbird-standard': BlackbirdIcon,
    'factory-boss-2am': FactoryBossIcon,
    'seed-crystal': CrystalIcon,
    'prototype-v01': PrototypeIcon,
    'kaehne-board': BoardIcon,
    'home-invasion': HomeIcon,
    'balance-demon': BalanceIcon,
    'useful-brain': UsefulBrainIcon,
    'safety-bureaucracy': SafetyIcon,
    'alpha-pack': AlphaIcon,
    'factory-scout': ScoutIcon,
    'supply-chain-gauntlet': ChainIcon,
    'series-a-mountain': MountainIcon,
    'pilot-line': PilotIcon,
    'beta-army': ArmyIcon,
    'design-for-million': DfmIcon,
    'factory-construction': ConstructionIcon,
    'workforce-legion': LegionIcon,
    'legal-world-tour': GlobeIcon,
    'soul-check': SoulIcon,
    'one-k-per-day': ThousandIcon,
    'final-boss': BossIcon,
  };

  const Icon = icons[levelId] ?? DefaultIcon;
  return <Icon size={size} />;
}

function DefaultIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="28" fill="#C16A28" opacity="0.2" />
      <text x="32" y="40" textAnchor="middle" fontSize="24">?</text>
    </svg>
  );
}

function RedLightIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="24" y="8" width="16" height="48" rx="4" fill="#1A1A1A" opacity="0.15" />
      <circle cx="32" cy="18" r="6" fill="#E74C3C" />
      <circle cx="32" cy="32" r="6" fill="#F39C12" className="pulse-yellow" />
      <circle cx="32" cy="46" r="6" fill="#1A1A1A" opacity="0.2" />
    </svg>
  );
}

function CouchIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M8 36h48v8c0 4-4 8-8 8H16c-4 0-8-4-8-8v-8z" fill="#C16A28" opacity="0.6" />
      <path d="M12 28h40v8H12z" fill="#C16A28" />
      <rect x="8" y="20" width="8" height="16" rx="2" fill="#C16A28" opacity="0.8" />
      <rect x="48" y="20" width="8" height="16" rx="2" fill="#C16A28" opacity="0.8" />
      <text x="32" y="34" textAnchor="middle" fontSize="8" fill="#EFE8DC" fontFamily="Georgia">Zzz</text>
    </svg>
  );
}

function BrainIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 12c-8 0-14 6-14 14 0 4 2 8 4 10-2 2-4 6-4 10 0 8 6 14 14 14s14-6 14-14c0-4-2-8-4-10 2-2 4-6 4-10 0-8-6-14-14-14z" fill="#C16A28" opacity="0.3" stroke="#C16A28" strokeWidth="2" />
      <text x="32" y="38" textAnchor="middle" fontSize="10" fill="#1A1A1A" fontFamily="Georgia">5</text>
    </svg>
  );
}

function CodeIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="10" y="14" width="44" height="36" rx="4" fill="#1A1A1A" opacity="0.1" stroke="#1A1A1A" strokeWidth="1.5" />
      <text x="18" y="30" fontSize="10" fill="#C16A28" fontFamily="monospace">def</text>
      <text x="18" y="42" fontSize="10" fill="#1A1A1A" fontFamily="monospace">move()</text>
    </svg>
  );
}

function SparkIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="20" fill="#F39C12" opacity="0.2" />
      <path d="M32 16v8M32 40v8M16 32h8M40 32h8" stroke="#F39C12" strokeWidth="2" />
      <circle cx="32" cy="32" r="6" fill="#F39C12" />
      <path d="M20 44l4-8 4 4 4-12 4 8 4-4" stroke="#C16A28" strokeWidth="2" fill="none" />
    </svg>
  );
}

function CoinIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="36" r="18" fill="#F39C12" stroke="#C16A28" strokeWidth="2" />
      <text x="32" y="41" textAnchor="middle" fontSize="14" fill="#1A1A1A" fontFamily="Georgia" fontWeight="bold">€</text>
      <text x="32" y="18" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5" fontFamily="Georgia">100</text>
    </svg>
  );
}

function FriendIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="24" cy="24" r="10" fill="#C16A28" opacity="0.4" />
      <circle cx="40" cy="24" r="10" fill="#C16A28" opacity="0.6" />
      <path d="M10 52c0-8 6-14 14-14s14 6 14 14M30 52c0-8 6-14 14-14" stroke="#C16A28" strokeWidth="2" fill="none" />
      <text x="32" y="14" textAnchor="middle" fontSize="12">🃏</text>
    </svg>
  );
}

function PrinterIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="16" y="28" width="32" height="20" rx="2" fill="#1A1A1A" opacity="0.15" />
      <rect x="20" y="12" width="24" height="16" rx="2" fill="#C16A28" opacity="0.3" />
      <rect x="22" y="36" width="20" height="16" fill="#C16A28" opacity="0.5" />
      <circle cx="44" cy="34" r="2" fill="#27AE60" />
    </svg>
  );
}

function FactoryIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="32" width="20" height="24" fill="#1A1A1A" opacity="0.15" />
      <rect x="28" y="24" width="20" height="32" fill="#1A1A1A" opacity="0.2" />
      <rect x="48" y="36" width="8" height="20" fill="#1A1A1A" opacity="0.15" />
      <rect x="12" y="20" width="6" height="12" fill="#C16A28" opacity="0.5" />
      <rect x="32" y="12" width="6" height="12" fill="#C16A28" opacity="0.6" />
      <circle cx="15" cy="16" r="3" fill="#1A1A1A" opacity="0.3" />
      <circle cx="35" cy="8" r="3" fill="#1A1A1A" opacity="0.3" />
    </svg>
  );
}

function CadIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="12" y="12" width="40" height="40" rx="2" fill="none" stroke="#C16A28" strokeWidth="1.5" strokeDasharray="4 2" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="#1A1A1A" strokeWidth="2" />
      <line x1="20" y1="44" x2="44" y2="20" stroke="#C16A28" strokeWidth="1" />
      <text x="48" y="16" fontSize="8" fill="#C16A28">⌀24</text>
    </svg>
  );
}

function DagobertIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="48" rx="24" ry="8" fill="#F39C12" opacity="0.3" />
      <circle cx="32" cy="36" r="20" fill="#F39C12" />
      <circle cx="32" cy="36" r="16" fill="#E8C547" />
      <text x="32" y="40" textAnchor="middle" fontSize="16">🦆</text>
      <text x="32" y="14" textAnchor="middle" fontSize="7" fill="#1A1A1A" fontFamily="Georgia">€10K</text>
    </svg>
  );
}

function PilgrimageIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="20" y="16" width="24" height="36" rx="4" fill="#1A1A1A" opacity="0.15" />
      <circle cx="32" cy="12" r="6" fill="#C16A28" opacity="0.5" />
      <rect x="26" y="24" width="4" height="12" fill="#C16A28" />
      <rect x="34" y="24" width="4" height="12" fill="#C16A28" />
      <rect x="28" y="40" width="8" height="4" fill="#C16A28" />
      <text x="48" y="20" fontSize="8" fill="#1A1A1A" opacity="0.4">no taste</text>
    </svg>
  );
}

function LimbIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="16" r="8" fill="#C16A28" opacity="0.4" />
      <rect x="28" y="24" width="8" height="16" rx="2" fill="#C16A28" />
      <rect x="24" y="40" width="8" height="14" rx="2" fill="#C16A28" opacity="0.7" transform="rotate(-15 28 47)" />
      <rect x="32" y="40" width="8" height="14" rx="2" fill="#C16A28" opacity="0.7" transform="rotate(15 36 47)" />
    </svg>
  );
}

function RosIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="20" cy="32" r="8" fill="#C16A28" opacity="0.4" />
      <circle cx="44" cy="20" r="8" fill="#C16A28" opacity="0.5" />
      <circle cx="44" cy="44" r="8" fill="#C16A28" opacity="0.6" />
      <line x1="28" y1="30" x2="36" y2="22" stroke="#1A1A1A" strokeWidth="1.5" />
      <line x1="28" y1="34" x2="36" y2="42" stroke="#1A1A1A" strokeWidth="1.5" />
      <text x="32" y="58" textAnchor="middle" fontSize="7" fill="#1A1A1A" opacity="0.4">/topic</text>
    </svg>
  );
}

function LegalIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 8L8 20v4c0 12 10 22 24 28 14-6 24-16 24-28v-4L32 8z" fill="#1A1A1A" opacity="0.1" stroke="#1A1A1A" strokeWidth="1.5" />
      <text x="32" y="36" textAnchor="middle" fontSize="10" fill="#C16A28" fontFamily="Georgia">GmbH</text>
    </svg>
  );
}

function EkkoIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="22" r="12" fill="#C16A28" opacity="0.4" />
      <path d="M16 52c0-10 7-18 16-18s16 8 16 18" fill="#C16A28" opacity="0.3" />
      <text x="32" y="26" textAnchor="middle" fontSize="10">✓</text>
      <text x="48" y="16" fontSize="7" fill="#1A1A1A" opacity="0.5">?</text>
    </svg>
  );
}

function BlackbirdIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="36" rx="16" ry="10" fill="#1A1A1A" opacity="0.8" />
      <circle cx="38" cy="28" r="8" fill="#1A1A1A" opacity="0.8" />
      <path d="M42 26l6-4" stroke="#F39C12" strokeWidth="2" />
      <circle cx="40" cy="27" r="2" fill="#F39C12" />
      <text x="32" y="54" textAnchor="middle" fontSize="7" fill="#C16A28" fontFamily="Georgia">no 2nd class</text>
    </svg>
  );
}

function FactoryBossIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="0" y="0" width="64" height="64" fill="#1A1A1A" opacity="0.05" />
      <circle cx="48" cy="12" r="8" fill="#F39C12" opacity="0.6" />
      <text x="48" y="15" textAnchor="middle" fontSize="8" fill="#1A1A1A">2AM</text>
      <rect x="12" y="28" width="40" height="24" fill="#1A1A1A" opacity="0.15" />
      <text x="32" y="44" textAnchor="middle" fontSize="8" fill="#C16A28">🎵 ABBA</text>
    </svg>
  );
}

function CrystalIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 8L48 28L32 56L16 28Z" fill="#C16A28" opacity="0.3" stroke="#C16A28" strokeWidth="2" />
      <text x="32" y="36" textAnchor="middle" fontSize="9" fill="#1A1A1A" fontFamily="Georgia">€500K</text>
    </svg>
  );
}

function PrototypeIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="14" r="8" fill="#C16A28" opacity="0.5" />
      <rect x="28" y="22" width="8" height="18" fill="#C16A28" opacity="0.4" />
      <line x1="28" y1="28" x2="18" y2="36" stroke="#C16A28" strokeWidth="3" />
      <line x1="36" y1="28" x2="46" y2="36" stroke="#C16A28" strokeWidth="3" />
      <line x1="30" y1="40" x2="24" y2="54" stroke="#C16A28" strokeWidth="3" />
      <line x1="34" y1="40" x2="40" y2="54" stroke="#C16A28" strokeWidth="3" />
      <text x="50" y="58" fontSize="7" fill="#1A1A1A" opacity="0.3">v0.1</text>
    </svg>
  );
}

function BoardIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="20" width="48" height="28" rx="4" fill="#1A1A1A" opacity="0.1" stroke="#C16A28" strokeWidth="1.5" />
      <circle cx="20" cy="34" r="6" fill="#C16A28" opacity="0.4" />
      <circle cx="32" cy="34" r="6" fill="#C16A28" opacity="0.5" />
      <circle cx="44" cy="34" r="6" fill="#C16A28" opacity="0.6" />
    </svg>
  );
}

function HomeIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 8L8 28v28h16V40h16v16h16V28L32 8z" fill="#C16A28" opacity="0.3" stroke="#C16A28" strokeWidth="1.5" />
      <circle cx="44" cy="48" r="6" fill="#1A1A1A" opacity="0.2" />
      <text x="44" y="51" textAnchor="middle" fontSize="8">🤖</text>
    </svg>
  );
}

function BalanceIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="52" rx="6" ry="3" fill="#1A1A1A" opacity="0.2" />
      <line x1="32" y1="52" x2="32" y2="20" stroke="#C16A28" strokeWidth="2" />
      <line x1="20" y1="28" x2="44" y2="32" stroke="#C16A28" strokeWidth="3" />
      <circle cx="32" cy="16" r="8" fill="#C16A28" opacity="0.4" />
      <text x="48" y="56" fontSize="12" fill="#1A1A1A" opacity="0.3">!</text>
    </svg>
  );
}

function UsefulBrainIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="16" y="36" width="32" height="8" rx="2" fill="#C16A28" opacity="0.3" />
      <circle cx="32" cy="24" r="12" fill="#C16A28" opacity="0.2" stroke="#C16A28" strokeWidth="1.5" />
      <text x="32" y="28" textAnchor="middle" fontSize="10">🧺</text>
      <text x="20" y="52" fontSize="8">🍽️</text>
      <text x="40" y="52" fontSize="8">🛒</text>
    </svg>
  );
}

function SafetyIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 8L8 18v14c0 14 10 26 24 30 14-4 24-16 24-30V18L32 8z" fill="#27AE60" opacity="0.2" stroke="#27AE60" strokeWidth="2" />
      <text x="32" y="38" textAnchor="middle" fontSize="10" fill="#27AE60" fontFamily="Georgia">CE</text>
    </svg>
  );
}

function AlphaIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {Array.from({ length: 10 }).map((_, i) => (
        <circle key={i} cx={12 + (i % 5) * 10} cy={20 + Math.floor(i / 5) * 20} r="4" fill="#C16A28" opacity={0.3 + i * 0.07} />
      ))}
      <text x="32" y="58" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5">α × 10</text>
    </svg>
  );
}

function ScoutIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="28" cy="28" r="16" fill="none" stroke="#C16A28" strokeWidth="2" />
      <line x1="40" y1="40" x2="52" y2="52" stroke="#C16A28" strokeWidth="3" />
      <rect x="44" y="8" width="16" height="20" fill="#1A1A1A" opacity="0.15" />
    </svg>
  );
}

function ChainIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="20" cy="32" rx="10" ry="6" fill="none" stroke="#C16A28" strokeWidth="2" />
      <ellipse cx="36" cy="32" rx="10" ry="6" fill="none" stroke="#C16A28" strokeWidth="2" />
      <ellipse cx="52" cy="32" rx="10" ry="6" fill="none" stroke="#C16A28" strokeWidth="2" />
      <text x="32" y="52" textAnchor="middle" fontSize="7" fill="#1A1A1A" opacity="0.4">6 months</text>
    </svg>
  );
}

function MountainIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M4 52L24 16L36 36L48 8L60 52Z" fill="#C16A28" opacity="0.2" stroke="#C16A28" strokeWidth="1.5" />
      <text x="32" y="48" textAnchor="middle" fontSize="8" fill="#1A1A1A" fontFamily="Georgia">€10M</text>
    </svg>
  );
}

function PilotIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="28" width="48" height="16" fill="#1A1A1A" opacity="0.1" stroke="#C16A28" strokeWidth="1.5" />
      <circle cx="20" cy="36" r="4" fill="#C16A28" opacity="0.5" />
      <circle cx="32" cy="36" r="4" fill="#C16A28" opacity="0.6" />
      <circle cx="44" cy="36" r="4" fill="#C16A28" opacity="0.7" />
      <text x="32" y="20" textAnchor="middle" fontSize="8" fill="#1A1A1A">100/yr</text>
    </svg>
  );
}

function ArmyIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <text x="32" y="24" textAnchor="middle" fontSize="14" fill="#C16A28" fontFamily="Georgia">1K</text>
      <text x="32" y="40" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5">homes</text>
      {Array.from({ length: 5 }).map((_, i) => (
        <text key={i} x={10 + i * 11} y="56" fontSize="8">🏠</text>
      ))}
    </svg>
  );
}

function DfmIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="12" y="12" width="40" height="40" rx="2" fill="none" stroke="#C16A28" strokeWidth="1.5" />
      <text x="32" y="30" textAnchor="middle" fontSize="10" fill="#C16A28" fontFamily="Georgia">DfM</text>
      <text x="32" y="44" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5">1M scale</text>
    </svg>
  );
}

function ConstructionIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="24" width="48" height="32" fill="#1A1A1A" opacity="0.15" />
      <path d="M8 24L32 8L56 24" fill="#C16A28" opacity="0.3" />
      <rect x="24" y="36" width="16" height="20" fill="#C16A28" opacity="0.2" />
      <text x="48" y="20" fontSize="12">🏗️</text>
    </svg>
  );
}

function LegionIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {Array.from({ length: 8 }).map((_, i) => (
        <circle key={i} cx={10 + (i % 4) * 14} cy={18 + Math.floor(i / 4) * 16} r="5" fill="#C16A28" opacity={0.3 + i * 0.08} />
      ))}
      <text x="32" y="58" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5">500+</text>
    </svg>
  );
}

function GlobeIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="24" fill="#C16A28" opacity="0.15" stroke="#C16A28" strokeWidth="1.5" />
      <ellipse cx="32" cy="32" rx="24" ry="10" fill="none" stroke="#C16A28" strokeWidth="1" />
      <line x1="8" y1="32" x2="56" y2="32" stroke="#C16A28" strokeWidth="1" />
      <text x="32" y="36" textAnchor="middle" fontSize="8" fill="#1A1A1A">EU·US·CN</text>
    </svg>
  );
}

function SoulIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 52C32 52 12 36 12 24C12 16 18 12 24 12C28 12 30 14 32 18C34 14 36 12 40 12C46 12 52 16 52 24C52 36 32 52 32 52Z" fill="#C16A28" opacity="0.4" stroke="#C16A28" strokeWidth="1.5" />
      <text x="32" y="30" textAnchor="middle" fontSize="8" fill="#1A1A1A">not boring</text>
    </svg>
  );
}

function ThousandIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <text x="32" y="28" textAnchor="middle" fontSize="18" fill="#C16A28" fontFamily="Georgia" fontWeight="bold">1K</text>
      <text x="32" y="42" textAnchor="middle" fontSize="8" fill="#1A1A1A" opacity="0.5">/day</text>
      <path d="M8 48h48" stroke="#C16A28" strokeWidth="2" strokeDasharray="4 2" />
    </svg>
  );
}

function BossIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <radialGradient id="bossGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F39C12" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#C16A28" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bossGlow)" />
      <rect x="14" y="20" width="36" height="32" rx="4" fill="#1A1A1A" opacity="0.15" stroke="#C16A28" strokeWidth="2" />
      <circle cx="32" cy="14" r="8" fill="#C16A28" opacity="0.6" />
      <rect x="22" y="28" width="6" height="14" fill="#C16A28" opacity="0.5" />
      <rect x="36" y="28" width="6" height="14" fill="#C16A28" opacity="0.5" />
      <text x="32" y="48" textAnchor="middle" fontSize="7" fill="#C16A28" fontFamily="Georgia">1M/yr</text>
      <text x="32" y="58" textAnchor="middle" fontSize="6" fill="#1A1A1A" opacity="0.5">BOSS</text>
    </svg>
  );
}
