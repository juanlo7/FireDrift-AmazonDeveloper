# Product

<!-- impeccable:product-schema 1 -->

## Platform

vega-tv — a native Fire TV app on Vega OS, built with React Native for Vega. Not
web, iOS or Android: a 10-foot UI driven only by a D-pad remote. The logical
screen is 960×540 dp (drawn at 2× on a 1080p TV).

## Users

People on the sofa who do not know what to watch tonight. They hold the Fire TV
remote, sit about 3 m from the TV, and want to pick something without scrolling
endless catalog rows. Secondary audience: the Amazon Developer Hackathon 2026
judges, who see the product in a demo video of under 3 minutes.

## Product Purpose

FireDrift helps you decide what to watch. It shows one movie or series at a
time, learns your taste from what you like, skip, watch and linger on, and opens
the streaming app that has the title with one button. Success: the viewer goes
from "I don't know what to watch" to the title playing in its streaming app in a
few seconds of remote presses.

## Positioning

It complements streaming services instead of replacing them: one feed across
every service the viewer has, ranked by FireDrift's own taste algorithm (no LLM
in the feed), plus an animated AI butler you can talk to. It is the TV version
of Driftune.

## Operating Context

- Used on a TV with the Fire TV remote only: Up/Down, Left/Right, OK, Back, Home.
  Every screen must show focus clearly from across the room.
- The feed is a paced sequence of full-screen covers (no trailer player on our
  devices: D8 plan B). One title is on screen at a time.
- First run asks for services and country; skipping must never block.
- Watch now lists the services that offer the title and opens one.
- Low-RAM device: few images in memory, one media player at most.

## Capabilities and Constraints

- Feed (FR-1), taste learning from like / skip / watch now / dwell (FR-2),
  Watch now (FR-3), services and country (FR-4), voice butler (FR-5).
- All titles, images, availability and links come from TMDB (JustWatch data).
- Official logos only as TMDB provides them; TMDB and JustWatch attributions on
  About.
- UI text and voice in English.
- Anonymous device profile, no login.

## Brand Commitments

- Name: FireDrift. It has its own visual identity; it does not inherit
  Driftune's look.

## Evidence on Hand

- Real catalog data through the backend (TMDB): posters, backdrops, provider
  logos.
- TMDB logo: `app/assets/images/tmdb-logo.png`.
- No testimonials, metrics or press exist; do not invent them.

## Product Principles

1. One decision at a time: the title on screen is the whole interface.
2. The remote is the only input: every action is one key away and visible.
3. Never block the viewer: errors and missing data degrade to something
   watchable.
4. Respect the streaming services: send the viewer to them, fast.

## Accessibility & Inclusion

10-foot legibility: large text, strong contrast over any backdrop, and a focus
state visible from 3 m. Never rely on color alone for selection.
