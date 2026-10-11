---
name: Kinetic Professional
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444651'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#222a3e'
  on-tertiary: '#ffffff'
  tertiary-container: '#384055'
  on-tertiary-container: '#a4acc5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 80px
---

## Brand & Style

The design system is engineered for **Swapiki**, focusing on "High-Velocity Trust Building." The brand personality is professional, authoritative, and human-centric, designed to appeal to both high-growth startups and seasoned recruiters. The UI evokes a sense of efficiency and clarity, moving away from the "noise" of AI-heavy platforms toward a transparent, human-first SaaS experience.

The visual style is **Corporate Modern**, characterized by:
- **Structured Precision:** A rigorous adherence to grid systems and consistent spacing.
- **Human-Centric Clarity:** High-contrast typography and intentional whitespace to reduce cognitive load.
- **Trust-Based Accents:** Utilizing a authoritative navy primary color paired with soft, functional background washes to create a calm yet productive environment.

## Colors

The palette is anchored by **Navy Blue (#1e3a8a)**, symbolizing stability and institutional trust. 

- **Primary:** Navy Blue (#1e3a8a) used for core brand elements, primary actions, and key headings.
- **Secondary:** Blue (#2563eb) used for interactive elements and subtle highlights to provide visual energy without sacrificing professionalism.
- **Tertiary:** Slate (#0f172a) used for maximum contrast text and dark-themed components.
- **Neutral:** A foundation of White (#ffffff) and Slate-50 (#f8fafc) creates a clean, airy background that allows content to remain the focus.
- **Functional:** Success (Emerald), Error (Rose), and Warning (Amber) are used sparingly as status indicators (e.g., "Human Verified" badges).

## Typography

The design system utilizes **Inter** exclusively to ensure a systematic, utilitarian aesthetic that scales perfectly from small captions to massive headlines.

- **Hierarchy:** Use Sentence case for almost all headings and body text to maintain a conversational and modern feel.
- **Emphasis:** Uppercase is reserved strictly for small labels (e.g., "PILOT PHASE," "NEW") and specific auxiliary button text where visual distinction is required.
- **Weights:** Headlines use Bold (700) or SemiBold (600) to establish a clear structural anchor. Body text stays in Regular (400) for maximum legibility.

## Layout & Spacing

The system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

- **Grid Model:** All layouts are centered within a 1280px container.
- **Rhythm:** An 8px base unit (4, 8, 16, 24, 32, 48, 64, 80) governs all padding and margins to ensure mathematical harmony.
- **Responsive Behavior:** 
  - **Desktop:** 48px margins with 24px gutters.
  - **Tablet:** 32px margins with 20px gutters.
  - **Mobile:** 16px margins with 16px gutters.
- **Verticality:** Large section gaps (80px+) are encouraged to prevent visual clutter and give the "High-Velocity" narrative room to breathe.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and extremely **Ambient Shadows**.

- **Surfaces:** Most content sits on White (#ffffff) containers against a Slate-50 (#f8fafc) background.
- **Shadows:** Use a "feather-light" approach. Primary containers use a 15% opacity Navy-tinted shadow with a large blur radius (e.g., `0 10px 30px -5px rgba(30, 58, 138, 0.08)`) to create depth without feeling heavy or dated.
- **Borders:** Subtle 1px borders in Slate-200 are used for secondary cards and input fields to define edges where shadows are not appropriate.

## Shapes

The design system uses a **Rounded (Level 2)** shape language. This provides a balance between the friendliness of consumer apps and the rigor of enterprise software.

- **Standard (0.5rem):** Used for buttons, input fields, and small cards.
- **Large (1rem):** Used for primary section containers, testimonial blocks, and featured profile cards.
- **Extra Large (1.5rem):** Reserved for high-level decorative elements or hero background containers.
- **Pill:** Strictly used for status badges (e.g., "Human Verified") and specific "Join" indicators.

## Components

### Buttons
- **Primary:** Solid Navy (#1e3a8a) with white text. 0.5rem radius. High-contrast, bold weight.
- **Secondary:** Outline Navy with Navy text, or Solid White with Navy text for "ghost" variations.
- **Tertiary/Ghost:** No border, Navy or Blue text, used for less critical actions like "View Demo."

### Cards
- **Profile Cards:** White background, Level 2 roundedness, subtle ambient shadow. Use internal padding of 24-32px to ensure breathability.
- **Step Cards:** Light-blue tint (#eff6ff) or simple bordered containers to guide the user through the "How it works" flow.

### Form Fields
- 1px Slate-200 border, 0.5rem radius. 
- Focus state: 2px Primary Blue (#1e3a8a) border with a soft blue outer glow.
- Labels: `body-sm` weight 600, positioned above the field.

### Status Badges (Chips)
- Rounded-full (pill) shape. 
- High-visibility colors with low-opacity backgrounds (e.g., Green text on Green-50 background) for "Human Verified" status.
- Text: `label-md` uppercase for high-impact recognition.

### Audio Player
- High-contrast Navy container with a distinct Play button icon. 
- Waveform or progress bar in Primary Blue to indicate activity.