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
