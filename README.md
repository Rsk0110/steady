# Steady

**Your phone becomes a ladder-safety partner.**

Most ladder accidents come from a few avoidable mistakes: the ladder set at the wrong angle, unstable footing, overreaching, or falling with nobody knowing. Steady uses the motion sensors already in your phone to help with each one, before and during the climb.

**Try it:** https://rsk0110.github.io/steady/ (open on a phone for the real sensors; on a laptop it switches to a demo mode with sliders).

## The four steps

1. **Angle:** lay the phone flat along a side rail. Steady reads the rail's angle from gravity and shows the ladder live against a wall.
   - The card turns green in the safe zone (about 76°, the "1 out for every 4 up" rule).
   - If you enter the ladder length, it tells you exactly how far to move the feet ("Move the feet 33 cm closer to the wall").
   - Sound guidance lets you adjust without looking: low ticks mean too shallow, high ticks mean too steep, and a chime means safe.
2. **Wobble:** rest the phone on a rung and push the ladder side to side for 3 seconds. Steady measures the movement and says whether the footing is steady.
3. **Check:** a 20-second pre-climb checklist, with the reason behind each item.
4. **Spotter:** put the phone in your pocket while you work.
   - If it detects a fall (near free-fall followed by a hard impact), it sounds a loud alarm and shows a one-tap button to call your emergency contact.
   - "I'm OK" cancels it.

## Private and offline

- No accounts, no server, no tracking. A Content Security Policy (`connect-src 'none'`) blocks the page from sending data anywhere.
- Your emergency contact is only saved if you tick the box, and only on your phone.
- Works offline after the first visit (service worker), handy in a garage or loft with poor signal.

## Honest limits

- Steady is a guide, not certified safety equipment. Always follow the ladder maker's instructions.
- Phone sensors vary. Angle readings are typically within about a degree; wobble and fall detection use thresholds and can miss events or raise false alarms.
- A web page can't place a call by itself. Steady makes calling one tap away, and the page must stay open for Spotter to work.
- The angle check is for leaning ladders. For step ladders, use the checklist (spreaders locked, level ground).

## How it works

- `src/ladder.js` holds the pure, unit-tested maths:
  - the rail angle from the gravity vector (`asin(|g_y| / |g|)`, independent of how the phone is twisted about the rail)
  - the angle bands and the base-distance advice
  - the wobble score (standard deviation of acceleration magnitude)
  - a free-fall-then-impact fall detector
- `src/app.js` contains the sensors (`devicemotion`, with the iOS permission prompt), the SVG ladder scene, Web Audio guidance, the vibration API, Wake Lock, and an automatic demo mode when no sensors are present.

```bash
python -m http.server 8000   # open http://localhost:8000
npm test                     # node --test (Node 20+)
```

## AI disclosure

Built with Claude (Anthropic) as an AI coding assistant for design, code, tests and documentation. Steady itself uses no AI.

## License

MIT
