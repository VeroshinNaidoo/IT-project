# EduQuest visual design

- Ground: `#F6F4EF`; cards: `#FFFFFF`, `1px #E3DFD5` border, `16px` radius.
- Ink/sidebar: `#14213D`; primary: `#3B4BDB`; primary tint: `#E4E7FB`.
- Highlight amber: `#F2A93B`; amber tint: `#FCE9C4`; amber text: `#6B4400`.
- Status colours: red `#B3261E`, orange `#C77700`, green `#2F8F5B`; always pair colour with a text label.
- Headings use Space Grotesk; body text uses DM Sans.
- Layout uses a 220px dark left sidebar and a main content area.
- Student navigation: Dashboard, Modules, Study groups, Leaderboard.
- Lecturer navigation: Modules, Resources, Quizzes, Analytics.
- Touch targets are at least 44px.
- Competitive quizzes show the banner: “One scored attempt only.”
- Defined screens: student dashboard, quiz taking, leaderboard with podium/ranked list and Module/My group toggle, lecturer analytics with stat cards, weakest topics, and group averages.

## UI refinement — 2026-10-10

Shared surfaces use restrained shadows, stronger heading hierarchy, and consistent
48px form controls. The login screen pairs an editorial welcome panel with a focused
form. Mobile navigation becomes a labelled top panel, preserving content width.
Cards enter with a 360ms fade/translation; controls use 180ms hover/focus transitions.
All motion is disabled with `prefers-reduced-motion: reduce`. CSS-only decoration
keeps the design lightweight. The approved palette and fonts remain unchanged.

## Accessibility contrast corrections — 2026-11-01

The shared stylesheet previously applied `opacity: 0.55` to disabled controls. That
blended otherwise-compliant text and backgrounds into failing contrast pairs. The
correction is global: disabled controls now remain opaque, disabled primary controls
use `#56617A`, and disabled secondary controls use ink `#14213D` on the existing
primary tint `#E4E7FB`.

| Token/state                 | Old effective value            | New value          | Measured ratio                                |
| --------------------------- | ------------------------------ | ------------------ | --------------------------------------------- |
| Disabled control opacity    | `0.55`                         | `1`                | evaluated at the explicit state colours       |
| Disabled primary background | blended `#7E87E2`              | `#56617A`          | white text: `6.20:1`                          |
| Disabled secondary text     | blended `#9BA0AF`              | `#14213D`          | on `#E4E7FB`: `13.02:1`                       |
| Existing muted text         | `#68718B`                      | `#4B5572`          | on white: `7.13:1`; on primary tint: `6.03:1` |
| Warning text inside cards   | inherited `#68718B` (`4.06:1`) | explicit `#6B4400` | on `#FCE9C4`: `7.17:1`                        |

The shared contrast regression test covers the normal text and component pairs used
by the app and requires at least `4.5:1` for normal text and `3:1` for components.
