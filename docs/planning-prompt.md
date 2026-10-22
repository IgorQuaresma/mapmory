# Role
You are a senior software architect and product engineer. Before writing any code, produce a detailed implementation plan for the application described below. If something important is ambiguous, list your assumptions and the open questions at the start, then continue with the plan using sensible defaults.

# Product vision
"Mapmory" is a web application that turns a user's special memory into a print-ready map poster.
The user describes a memory in natural language (e.g. "The night we got engaged on the Pont des Arts in Paris, 14 June 2019"). The app extracts the location and context, generates a first map design automatically, lets the user refine it visually without typing any more prompts, and exports a high-resolution file that a professional print shop can print.

# Core user flow
1. **Describe the memory**: the user writes a free-text prompt.
2. **Interpret it**: the system extracts the structured data it needs: place(s), date, title/caption, people's names if given, and mood/tone. It geocodes the place. If the location is ambiguous or can't be found, the user picks from candidates or places a pin on the map by hand.
3. **First draft**: the system generates an initial design: map extent and zoom, a style or theme chosen to fit the mood, a marker at the event location, and suggested title, subtitle, date and coordinates text.
4. **Visual customization (no more prompting)**: the user adjusts the design with UI controls and a live preview. At minimum:
   - Map style/theme presets, plus a color palette (land, water, roads, background)
   - Pan, zoom, rotation and map shape (rectangle, circle, heart, etc.)
   - Which layers are shown (roads, buildings, water, parks, labels)
   - Marker: icon, color, size, position; optionally several markers
   - Text: title, subtitle, date, coordinates, font family, size, position, show/hide
   - Layout: paper size (A4–A0, US Letter, 30×40 cm, 50×70 cm…), orientation, margins, frame/border
   - Undo/redo, reset to the first draft, save the design and come back to it later
5. **Export**: the user downloads a print-ready file: PDF (vector where possible) and PNG at 300 DPI for the chosen physical size, with optional bleed and crop marks. The export must match the preview exactly.

# Technical constraints
- Use **OpenStreetMap data and open-source libraries only** (for example MapLibre GL JS, vector tiles via OpenMapTiles/Protomaps PMTiles, Nominatim/Photon for geocoding, a server-side renderer for high-res output). Compare the realistic options and justify your choice.
- Follow OSM's tile and Nominatim **usage policies**. Assume we can't use the public tile servers for high-resolution exports, and plan self-hosted or properly licensed tile and geocoding infrastructure.
- Handle **ODbL attribution** correctly, including on the printed output.
- High-resolution rendering: explain how to render very large outputs (for example A0 at 300 DPI is about 9933×14043 px) reliably. Cover tiling or stitching, memory limits, the job queue, timeouts, and keeping the export identical to the preview (fonts, symbol scaling, label density at print scale).
- Natural-language interpretation can use an LLM. Propose a provider-agnostic design, define the structured output schema, and include a non-LLM fallback (for example an explicit location search).

# Security and privacy requirements
Memories are personal data. Treat security and privacy as first-class concerns:
- OWASP Top 10 mitigations, strict input validation and output encoding, CSP and secure headers
- Prompt-injection defense: treat LLM output as untrusted, validate it against a schema, and never let it trigger actions or fetch arbitrary URLs
- SSRF protection for every server-side fetch (tiles, fonts, geocoding)
- Authentication (or anonymous sessions with limits), authorization on saved designs and exports, rate limiting and abuse protection, especially on LLM calls and render jobs
- Secrets management, dependency and container scanning, least-privilege infrastructure
- GDPR: data minimization, retention and deletion of prompts and exports, user data export and deletion, cookie/consent handling
- Secure storage and expiring signed URLs for generated files

# UX requirements
- Friendly, guided flow (stepper/wizard), with a live preview that reflects every change immediately
- Responsive (desktop first, usable on mobile), accessible (WCAG 2.2 AA), with good empty, loading and error states
- Fast first draft (state a target, e.g. under 10 s) and clear progress feedback during export

# What I want from you (deliverables)
1. Assumptions and open questions
2. High-level architecture (with a diagram in text/mermaid): frontend, backend/API, NLP/LLM service, geocoding, tile serving, render/export workers, storage, queue
3. Technology choices with trade-offs and the recommended stack
4. Data model (design document schema, user, export job) and a versioned "map design" JSON format that both the preview and the renderer consume
5. API design (main endpoints and payloads)
6. Detailed frontend plan: component structure, state management, customization panel, undo/redo
7. Print/export pipeline in detail, including DPI, color handling (RGB vs. CMYK guidance for printers), bleed, fonts and file formats
8. Security and privacy plan mapped to the requirements above, plus a short threat model
9. Testing strategy (unit, visual regression of the renders, end-to-end, load testing the render workers)
10. Deployment, hosting, cost drivers and scaling (tile storage size, render compute, LLM cost)
11. Phased roadmap: MVP → v1 → later (e.g. print-shop integration, multiple locations or routes, star map for the date), with a rough effort for each phase
12. Main risks and how to reduce them

Don't write implementation code yet, except small snippets where they clarify a decision.
