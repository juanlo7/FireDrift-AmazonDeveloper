---
version: 1
slug: "app-src-screens-feedscreen-tsx"
primary_target: "app/src/screens/FeedScreen.tsx"
related_targets: ["app/src/watchNow/WatchNowSheet.tsx","app/src/feed/FeedMenu.tsx","app/src/settings/ServicesForm.tsx","app/src/screens/AboutScreen.tsx"]
---

# FireDrift TV app — surface brief

Scope: the whole Vega TV app (feed, Watch now, menu, setup and settings, About). Mode: Operate, image-first. Audience: someone on the sofa at night, 3 m from the TV, remote only. Job: decide what to watch and open its streaming app. Must avoid: an overloaded screen. The title's image dominates; text is minimal.

## Direction contract

THESIS: The title's own one-sheet poster, lit inside a cinema lightbox case, and the room glows in its colours. Refuses the streaming billboard (backdrop + left fade + button row + thumbnail rail).

OWN-WORLD: A dark lobby wall (#0d0c0b) washed by the title's backdrop, blurred and dimmed, as ambient light. One lit case with a warm bulb glow (#ffd9a0) holds the portrait poster. Marquee lettering in Big Shoulders Display Black, uppercase, warm white (#f6efe4). Body and data in Figtree, muted stone (#b3a898). One amber (#ffb547) owns every live state: the focused chip, the selected service, the liked mark. Controls are pill chips; focus is the amber fill with a warm shadow, never a white ring.

STORY: The viewer sees one poster, lit, reads the title from the sofa, sees where it streams, and presses OK to watch, Right to like, Left to skip, Down for the next case.

FIRST VIEWPORT: Left third: the lit case with the poster at 860 px tall. Right two thirds: "NOW SHOWING · n / 20" top right, the marquee title (up to 2 lines), one meta line, a 2-line synopsis, then the service chips with the primary "Watch on <service>" chip in amber. Key legend at the bottom right column. Signature interaction: Down slides the case out and the next poster in while the ambient light crossfades to the new colours.

FORM: Lightbox One-Sheet, position 1 on the ordered list (cinema lobby lightbox), chosen as the model pick. Seed key 7662c0a2.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
