// Swapiki — generates 56 deterministic flat-style Indian avatar SVGs into
// photos/dummy/ for the seeded dummy profiles (see supabase/seed_dummy_profiles.sql).
//
//   node scripts/generate-dummy-avatars.js
//
// Each file is named <candidate-id>.svg and the DB backfill script
// (supabase/set_dummy_avatars.sql) points candidates.avatar at
// '/photos/dummy/<candidate-id>.svg'.
//
// Replace any .svg here with a real AI photo of the SAME filename
// (photos/dummy/dummy-it-001.jpg etc.) and the site picks it up — zero code
// changes, just re-deploy the Pages site.
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'photos', 'dummy');

const PROFILES = [
  ['dummy-it-001', 'm'], ['dummy-it-002', 'f'], ['dummy-it-003', 'm'], ['dummy-it-004', 'f'],
  ['dummy-it-005', 'm'], ['dummy-it-006', 'f'], ['dummy-it-007', 'm'], ['dummy-it-008', 'f'],
  ['dummy-it-009', 'm'], ['dummy-it-010', 'f'], ['dummy-it-011', 'm'], ['dummy-it-012', 'f'],
  ['dummy-it-013', 'm'], ['dummy-it-014', 'f'], ['dummy-it-015', 'm'], ['dummy-it-016', 'f'],
  ['dummy-it-017', 'm'], ['dummy-it-018', 'f'], ['dummy-it-019', 'm'], ['dummy-it-020', 'f'],
  ['dummy-it-021', 'm'], ['dummy-it-022', 'f'], ['dummy-it-023', 'm'], ['dummy-it-024', 'f'],
  ['dummy-it-025', 'm'], ['dummy-it-026', 'f'], ['dummy-it-027', 'm'], ['dummy-it-028', 'f'],
  ['dummy-it-029', 'm'], ['dummy-it-030', 'f'], ['dummy-it-031', 'm'], ['dummy-it-032', 'f'],
  ['dummy-it-033', 'm'], ['dummy-it-034', 'f'],
  ['dummy-bfsi-001', 'm'], ['dummy-bfsi-002', 'f'], ['dummy-bfsi-003', 'm'], ['dummy-bfsi-004', 'f'],
  ['dummy-bfsi-005', 'm'], ['dummy-bfsi-006', 'f'], ['dummy-bfsi-007', 'm'], ['dummy-bfsi-008', 'f'],
  ['dummy-bfsi-009', 'm'], ['dummy-bfsi-010', 'm'], ['dummy-bfsi-011', 'f'], ['dummy-bfsi-012', 'm'],
  ['dummy-bfsi-013', 'f'], ['dummy-bfsi-014', 'm'], ['dummy-bfsi-015', 'f'], ['dummy-bfsi-016', 'm'],
  ['dummy-bfsi-017', 'f'], ['dummy-bfsi-018', 'm'], ['dummy-bfsi-019', 'f'], ['dummy-bfsi-020', 'f'],
  ['dummy-bfsi-021', 'm'], ['dummy-bfsi-022', 'f'],
];

const SKIN_TONES = ['#f1c7a3', '#e8b58e', '#ddab8a', '#d29a72', '#c68a58', '#b06f43', '#9c5f38'];
const HAIR_COLORS = ['#231a18', '#2b211c', '#33251b', '#1d1611', '#261c16'];
const BG_COLORS = ['#dbe7ff', '#ffe4d6', '#dff3e3', '#fdeecb', '#eadff7', '#d7f0f4', '#f8e3ec', '#e4ecfa'];
const SHIRT_COLORS = ['#35507a', '#c2574f', '#3c7a63', '#7a5aa8', '#c98a3d', '#4a7a9c', '#8a4b3a', '#37646b'];
const EYE_COLOR = '#241b12';

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed, salt) {
  return arr[(hashString(seed) + salt) % arr.length];
}

function avatarSvg(id, gender) {
  const skin = pick(SKIN_TONES, id, 1);
  const hair = pick(HAIR_COLORS, id, 2);
  const bg = pick(BG_COLORS, id, 3);
  const shirt = pick(SHIRT_COLORS, id, 4);
  const female = gender === 'f';

  const hairSide = female ? `
    <rect x="40" y="66" width="26" height="96" rx="13" fill="${hair}"/>
    <rect x="134" y="66" width="26" height="96" rx="13" fill="${hair}"/>
    <circle cx="100" cy="66" r="22" fill="${hair}"/>` : '';
  const browW = female ? 4 : 5;
  const smile = female
    ? `<path d="M86 130 Q 100 142 114 130" stroke="#b0543a" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : `<path d="M88 128 Q 100 139 112 128" stroke="#8a4a2a" stroke-width="5" fill="none" stroke-linecap="round"/>`;

  return `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="avatar">
  <defs>
    <clipPath id="c-${id}"><circle cx="100" cy="100" r="100"/></clipPath>
  </defs>
  <g clip-path="url(#c-${id})">
    <rect width="200" height="200" fill="${bg}"/>
    <path d="M30 200 C30 148 62 132 100 132 C138 132 170 148 170 200 Z" fill="${shirt}"/>
    <rect x="87" y="116" width="26" height="34" rx="9" fill="${skin}"/>
    <circle cx="100" cy="94" r="60" fill="${hair}"/>
    ${hairSide}
    <circle cx="100" cy="100" r="54" fill="${skin}"/>
    <circle cx="46" cy="104" r="10" fill="${skin}"/>
    <circle cx="154" cy="104" r="10" fill="${skin}"/>
    <path d="M64 96 Q 80 88 96 96" stroke="${hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <path d="M104 96 Q 120 88 136 96" stroke="${hair}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>
    <circle cx="81" cy="106" r="4.5" fill="${EYE_COLOR}"/>
    <circle cx="119" cy="106" r="4.5" fill="${EYE_COLOR}"/>
    ${smile}
  </g>
</svg>
`;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let count = 0;
  for (const [id, gender] of PROFILES) {
    fs.writeFileSync(path.join(OUT, `${id}.svg`), avatarSvg(id, gender));
    count++;
  }
  console.log(`Generated ${count} avatars -> ${OUT}`);
}

main();