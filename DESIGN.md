# Design system

Sanchay is meant to be calm and easy to read for people who check their finances every day. The tokens live in `src/renderer/src/styles.css`. Charts read the same tokens through `PAL` in `src/renderer/src/lib/theme.ts`, so CSS and SVG colours always match.

## Who we design for

Indian professionals, founders and freelancers, mostly aged 26 to 40, on a Mac. They care about privacy, already use Zerodha, Groww, INDmoney or CRED for money, and use tools like Notion, Linear and Arc at work. The target feel is as calm as Linear, with some personality. It should not feel like a hype app or a bank portal.

## Colour

The default neutrals are warm, paper and stone tones, never pure white or black.

| Token               | Light                             | Dark                              |
| ------------------- | --------------------------------- | --------------------------------- |
| canvas              | `#F5F3EF`                         | `#141211`                         |
| surface             | `#FDFCFA`                         | `#1C1A18`                         |
| sunken              | `#EEEBE5`                         | `#100F0E`                         |
| line / line-strong  | `#E5E1D9` / `#D2CCC1`             | `#2F2B28` / `#423C37`             |
| ink / ink-2 / ink-3 | `#1E1A17` / `#56504A` / `#736B63` | `#F1ECE6` / `#BCB3A9` / `#968D83` |

The brand accent in the default style is Jamun, a mulberry: `#7A3B6C` in light mode and `#D88CC6` in dark. It's used for primary buttons, focus rings, the selected nav item and the AI CFO, and never on amounts or charts. We picked it because Indian fintech has already claimed green (Groww), blue (Zerodha, Paytm), purple (PhonePe) and black (CRED).

Amounts are coloured by temperature, and only these four colours are used for them:

| Role | Meaning                            | Light text | Dark text |
| ---- | ---------------------------------- | ---------- | --------- |
| cold | investments, net worth             | `#3D4FB0`  | `#97A6F4` |
| cool | income, savings, gains             | `#0B735E`  | `#52C7A5` |
| warm | spending                           | `#8F5B00`  | `#E8B04E` |
| hot  | overspending, losses, fees, alerts | `#A21F2E`  | `#F27382` |

Each role also has a `-soft` background and a brighter `-tint` that is used only for fills such as heatmaps and meters. Every text colour passes WCAG AA (at least 4.5:1) on surface and sunken, and the four stay distinct under protanopia, deuteranopia and tritanopia. Colour is always paired with a sign or an icon (+/−, ▲▼).

Category colours (`src/shared/categories.ts`) are for swatches and chart segments, never for amounts. Charts show at most 8 categories plus "Other", each with a label.

## Shape and depth

Corner radius is 4px for tags, 6 to 8px for inputs and buttons, 14px for cards, 20px for dialogs, and fully round for pills.

Borders come first. Shadows are only for raised layers: `.material` cards are surface plus a hairline border plus `--shadow-sm`, and `.gloss` hero cards use `--shadow-md`. In the default style, gradients appear only on hero numbers (`.hero-number`, from cold to Jamun) and sparkline fills.

## Type

The UI and every number use the system's SF Pro with tabular figures (`.num`). It includes ₹ and works offline. Titles use Fraunces (OFL, bundled through `@fontsource-variable/fraunces`) with the SOFT axis raised, and never appear on amounts. Numbers use Indian formatting everywhere: ₹1,23,456, ₹12.4L and ₹1.2Cr.

## Motion

Hover takes 120 ms and panels 200 to 240 ms, with the easing `cubic-bezier(.2,.8,.2,1)`. Hero figures count up once when they change (`useCountUp`). All motion respects `prefers-reduced-motion`.

## Things to avoid

Avoid pure #000 or #FFF canvases, semantic colours used as decoration, the brand colour on numbers, more than one accent per view, and motion on every re-render.

## Styles

The same tokens and meanings come in 19 styles, chosen in Settings → Appearance and set on `html[data-style]`. Each has a light and a dark mode, and the mode can also follow macOS. Paper is the default.

Six were designed for Sanchay:

| Style    | Look                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Paper    | Warm neutrals, Jamun accent, Fraunces titles, soft 14px cards                                              |
| Studio   | Neutral zinc greys, teal accent, 10px cards, a light lift, sans titles                                     |
| Ocean    | Cool blue-slate with a sky-blue accent                                                                     |
| Graphite | Pure greys with a violet accent, closer to a tool                                                          |
| Terminal | Like TradingView: blue `#2962FF` accent, green and red for gains and losses, 4 to 6px corners, flat, dense |
| Neo      | Based on CRED's NeoPOP: black, neon lime and hard edges                                                    |

Seven use the official palettes of popular editor themes: Catppuccin (Latte and Mocha), Nord, Dracula, Rosé Pine, Tokyo Night, Solarized and Gruvbox.

Six follow well-known design languages: Liquid Glass (Apple), Material You (Google), Fluent (Microsoft), Swiss, Frutiger Aero and Neumorphism. Neumorphism has lower contrast by design.

In every style, each theme's own blue, green, amber and red stand in for cold, cool, warm and hot, so the meanings never change. On light themes they are darkened enough to keep amounts readable.

The rules above describe the default Paper style. Some styles break the shape rules on purpose: Neo uses hard offset shadows and square corners, Liquid Glass uses frosted panels, and Neumorphism uses soft extruded surfaces.

## App icon

`resources/icon.svg` is the only source for the logo: three gold coins stacked like steps, with a green sprout, on a near-black tile with an emerald glow. It produces `icon.png` and `icon.icns`, the start-up screen and the `Logo` component.
