# Costing brief: inhabit (voice-controlled bathroom visualiser)

*Paste this whole document into a new Claude chat as the opening message.*

---

## What I want from you

I run **Glyptika Studios LLP**, a design and visualisation studio in India. We've built a working
prototype of **inhabit**: a showroom product where customers change a bathroom's fixtures,
finishes, tiles and lighting by **speaking** or tapping a phone/tablet, and see the change
instantly in a photoreal 3D room on a big screen.

If it goes beyond prototype, I need to work out what it will cost. Help me think through:

1. **Development cost:** what's left to build, the team, and the time to turn the prototype into
   a product we can install and support.
2. **Hardware cost:** per showroom, and the options (local PC vs cloud GPU), with trade-offs.
3. **Running costs:** monthly and yearly per showroom: hosting, internet, licences, maintenance,
   support, content updates.
4. **Pricing:** how to price it to a client (one-time + subscription? per showroom? per catalogue
   item?) so it's profitable.

Work in **Indian rupees**, with USD where a cost is billed in dollars. Ask me questions where
the answer changes the numbers. Don't assume; list your assumptions. Give ranges where prices vary,
and tell me which prices you're unsure of so I can check them.

---

## What the prototype does today (working, tested)

- A photoreal 3D bathroom (10 x 8 ft, 2.8 m ceiling) rendered live in **Unreal Engine 5.7**,
  shown on a TV/screen through a web browser (**Pixel Streaming**).
- A **phone/tablet web page** (no app install) that controls the room: buttons with real
  product names, Kohler model numbers and colour swatches.
- **Always-on voice:** the page asks for the mic when opened and listens until closed. It ignores
  people talking to each other and acts only on requests ("show me the brass tap", "grey tiles",
  "warmer lights", "undo"). It asks back when unsure ("Did you mean the commode?"), and speaks
  its reply. Saying "Inhabit, …" always gets its attention.
- **All speech runs offline on the showroom PC** (Whisper for speech-to-text, Piper for the voice
  reply). No cloud AI, no per-request fees, no audio stored.
- **What can be changed (10 choices):**

| Item | Options |
| --- | --- |
| Tap | Kohler Purist Tall Deck Tap (K-14404-4A), Purist Wall-Mount Tap (K-T14414-4), Vive Tall Deck Tap (K-23967IN-4ND), Vive Wall-Mount Tap (K-23975IN-4ND) |
| Commode | Kohler Veil Compact (K-6299) and Brazn Rimless (K-21748), wall-hung; Veil One-Piece (K-1381), floor-standing |
| Washbasin | Kohler above-counter vessels: Veil Oval (K-20704), Vox Round (K-14800), Vox Rectangle (K-2660-1) |
| Showerhead | Kohler Purist Single-Spray (K-939-G), Purist 2-in-1 Combo (K-23219-G) |
| Tap and shower finish | Matte Black, Polished Chrome, Brushed Brass, Brushed Bronze |
| Commode and basin colour | White, Biscuit, Dune, Black |
| Wall tiles | Beige stone, Grey stone |
| Lighting | Warm (~2700 K), Daylight (~5000 K) |

- Knows real product rules, e.g. the Vox rectangle basin needs a wall-mounted tap, so it switches both.
- **Phone access from anywhere** through a free Cloudflare tunnel (HTTPS link). Phones need HTTPS
  for the mic.

Built so far: ~4 days of focused work by one person with AI assistance (19–22 Nov 2026), 16
commits. The demo is due around 23 Dec 2026; prototype delivery is the first week of Jan 2027.

---

## How it's built

```
phone/tablet page (mic, buttons)  --HTTPS tunnel-->  control server (Node.js, on the showroom PC)
                                                         |  speech: ffmpeg -> Whisper -> phrase rules -> Piper reply
                                                         |  WebSocket commands
                                                         v
                                        Unreal Engine 5.7 game (renders the room on the GPU)
                                                         |  Pixel Streaming (WebRTC video)
                                                         v
                                        TV / any browser shows the room live
```

| Part | Technology | Licence / cost today |
| --- | --- | --- |
| 3D room and rendering | Unreal Engine 5.7, Lumen + hardware ray tracing, Variant Manager | Free to develop. Licensing for a commercial non-game product needs checking (Epic's terms for non-game/enterprise use changed in 2024; may need a paid seat) |
| Streaming to browser | Unreal Pixel Streaming 2 + Epic's signalling server | Free (part of Unreal). Remote viewers outside the LAN need a TURN server (not set up) |
| 3D models | Kohler's free CAD downloads (OBJ) + room modelled in Blender | Free, but **check Kohler's licence for commercial use** of their CAD |
| Textures, materials, props | Made in-house | Free |
| Control server | Node.js / TypeScript, 28 automated tests | Free (open source) |
| Speech-to-text | whisper.cpp, base.en model, CPU | Free (MIT) |
| Voice reply | Piper TTS, en_US "lessac" voice | Free software; **check the voice model's licence** |
| Phone link | Cloudflare quick tunnel (random link each start) | Free. A fixed link (for a QR code) needs a Cloudflare account + domain |
| Code hosting | Private GitHub repo + Git LFS for 3D assets (~27 MB) | Free tier today |

---

## Hardware the prototype runs on (one PC does everything)

| Part | Spec |
| --- | --- |
| CPU | Intel Core i7-12700KF (12 cores / 20 threads) |
| RAM | 32 GB |
| GPU | NVIDIA GeForce RTX 5070, 12 GB |
| OS | Windows 11 Pro |
| Disk | Project ~3.4 GB; Unreal Engine install ~60–100 GB (development only) |

This PC renders 1920x1080 with ray tracing, encodes the video stream, and runs speech
recognition at the same time. Not yet measured: frame rate under load, power draw, and how many
simultaneous viewers it can stream to.

**Showroom kit to cost:** the PC (or cloud alternative), a large TV/display, phones or tablets
for customers (or customers use their own), a good microphone/speaker if voice is used from the
PC side, network/router, UPS.

---

## Not built yet (needed before a real product)

1. **Packaged build:** Unreal currently runs from the project files; it must be packaged into a
   standalone app that starts on boot.
2. **More catalogue:** each new product needs a 3D model cleaned up, placed and given finishes.
   Today ~8 fixtures. A real client may want 50–500 SKUs, more room layouts and sizes, more tiles
   (tiles were generated in-house; real tile textures from manufacturers).
3. **Fixed HTTPS link and QR code:** named Cloudflare tunnel on our domain (needs account setup).
4. **TURN server:** for streaming to viewers outside the showroom network.
5. **Multiple languages:** Hindi or regional-language voice (Whisper supports many; the phrase
   rules are English only today).
6. **Admin/content tool:** so non-developers can add products and prices.
7. **Reliability:** auto-restart, monitoring, remote updates, logs, crash recovery.
8. **Security:** the phone link has no login today (anyone with the link can control the room).
9. **Analytics** for the client: which products customers looked at, for how long.
10. Possibly: quotes/BOM export (price list of the chosen fixtures), save/share a design, WhatsApp
    or email the customer their design.
11. Known gap: daylight lighting with beige tiles looks washed out (tuning).

---

## Deployment options to compare

- **A. One PC per showroom** (as the prototype): one-time hardware, low running cost, needs
  on-site support, works offline.
- **B. Cloud GPU per showroom** (AWS/Azure/GCP GPU instances, or Epic-compatible streaming
  hosts): no PC on site, pay per hour, needs good internet, voice would move to the cloud or stay
  on a small local box.
- **C. Hybrid:** central rendering for many showrooms; or a web/remote version customers use
  from home (each concurrent user needs GPU time, the big cost driver).

---

## Questions you should ask me before finalising numbers

- Who is the client (one brand like Kohler, a retailer, a tile company, architects)? How many
  showrooms, which cities?
- Expected visitors per day and peak simultaneous users per showroom?
- Will customers use it at home (remote) or only in-store?
- Catalogue size at launch and how often it changes?
- Our team rates (3D artist, Unreal developer, web developer, PM) and whether we hire or freelance?
- Support level the client expects (hours, on-site visits, response time)?
- Do we sell it, licence it per year, or charge per showroom per month?

---

*Generated from the prototype repository (glyptikapc1/Inhabit-Prototype, private) on 22 Nov 2026.
Technical details: README.md, docs/command-protocol.md, unreal/README.md, blender/README.md.*
