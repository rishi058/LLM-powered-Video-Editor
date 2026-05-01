# Rule: Adding New Video Editing Features

This rule must be consulted before adding ANY new video editing feature
(transitions, animations, media types, effects, AI tools, export options, trim/mute, etc.)
to the **AfterEffects-level AI Video Editor**.

---

## 🏗️ Architecture Overview

The project has **three independent processes** that must all be updated for most features:

```
┌─────────────────────────────────────────────────────────────┐
│  videoeditor/          (React SPA — Vite dev server)        │
│  ├── src/components/timeline/     Timeline UI + scrubbers   │
│  ├── src/components/chat/         AI chat interface         │
│  ├── src/utils/llm-handler.ts     AI tool implementations   │
│  ├── src/video-compositions/      Live preview player       │
│  └── src/schemas/                 Shared Zod schemas        │
├─────────────────────────────────────────────────────────────┤
│  backend/              (Python FastAPI — port 8000)         │
│  ├── routes/video_editing/        REST endpoints            │
│  │   ├── trim.py                  Trim media via FFmpeg     │
│  │   └── export.py                Export/render trigger     │
│  └── services/ai/                                           │
│      ├── tools_registry.py        AI tool catalog (JSON)    │
│      └── ai_service.py            LLM orchestration         │
├─────────────────────────────────────────────────────────────┤
│  render-server/        (Node/Remotion — port 8000)          │
│  └── src/composition/                                       │
│      ├── TimelineComposition.tsx  The Remotion compositor   │
│      ├── types.ts                 Shared type contracts      │
│      └── SubtitleTrackRenderer.tsx Subtitle renderer        │
└─────────────────────────────────────────────────────────────┘
```

### Key Data Flow

```
User edits in UI → TimelineState (React state) → getTimelineData()
  → TimelineDataItem[] sent to render-server → Remotion renders frames
                         ↕
User types in chat → ChatBox.tsx → backend /ai/message
  → ai_service.py + tools_registry.py → FunctionCallResponse
  → llm-handler.ts dispatches to timeline handlers
```

---

## 📋 The Five Integration Points

Every new feature MUST touch some subset of these five files/areas:

| # | Area | File | Purpose |
|---|------|------|---------|
| 1 | **Type Contract** | `render-server/src/composition/types.ts` | Defines the data shape shared between all layers |
| 2 | **Remotion Renderer** | `render-server/src/composition/TimelineComposition.tsx` | Renders frames — controls what the video actually looks like |
| 3 | **Live Preview** | `videoeditor/src/video-compositions/VideoPlayer.tsx` | In-browser preview — must mirror the renderer exactly |
| 4 | **AI Tool Registry** | `backend/services/ai/tools_registry.py` | Tells the LLM what tools exist and their JSON schemas |
| 5 | **AI Tool Handler** | `videoeditor/src/utils/llm-handler.ts` | Implements the action when the LLM calls a tool |

---

## 🔄 Feature Addition Checklists

### A. Adding a New Custom Transition

**Files to modify (in order):**

1. **`render-server/src/composition/types.ts`** — Add the new name to the union:
   ```ts
   presentation: "fade" | "wipe" | "clockWipe" | "slide" | "flip" | "iris" | "YOUR_NEW_TRANSITION";
   ```

2. **`render-server/src/composition/TimelineComposition.tsx`** — Add a case in `getTransitionPresentation()`:
   ```ts
   // Import at top:
   import { yourTransition } from "@remotion/transitions/your-transition";
   // OR define a custom TransitionPresentation<{}> component here.

   case "yourNewTransition": return yourTransition({ /* options */ });
   ```

3. **`videoeditor/src/video-compositions/VideoPlayer.tsx`** — Mirror the same `switch` logic in the live preview's own `getTransitionPresentation()` (it duplicates the render-server's logic for the browser player).

4. **`videoeditor/src/schemas/timeline.ts`** (if a Zod schema exists for transitions) — add the new string to the enum.

5. **(Optional) AI support** — Add to `tools_registry.py` if users should say *"add a zoom transition here"* and it fires automatically.

> **Custom Remotion Transitions**: Implement `TransitionPresentation<MyProps>` — it needs `component`, `defaultProps`, and `measureDuration`. Place in `render-server/src/composition/transitions/MyTransition.tsx`.

---

### B. Adding a Remotion Animation / Motion Effect to a Clip

Remotion animations are driven by `useCurrentFrame()` and `interpolate()`.

1. **`render-server/src/composition/TimelineComposition.tsx`** — In `createMediaContent()`, add a new `case` for the media type OR add an `effects` array to the scrubber and map it:
   ```ts
   case "video": {
     // wrap with an animation HOC
     content = (
       <AbsoluteFill style={{ ...scrubber.position }}>
         <ZoomIn durationInFrames={scrubber.animationFrames}>
           <OffthreadVideo src={videoUrl!} />
         </ZoomIn>
       </AbsoluteFill>
     );
   }
   ```
   Create the animation component in `render-server/src/composition/animations/ZoomIn.tsx`:
   ```tsx
   import { useCurrentFrame, interpolate } from "remotion";
   export function ZoomIn({ children, durationInFrames }) {
     const frame = useCurrentFrame();
     const scale = interpolate(frame, [0, durationInFrames], [0.8, 1], { extrapolateRight: "clamp" });
     return <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
   }
   ```

2. **`render-server/src/composition/types.ts`** — Add animation metadata to `BaseScrubber`:
   ```ts
   animation?: {
     type: "zoomIn" | "zoomOut" | "fadeIn" | "fadeOut" | "slideIn" | "bounce";
     durationInFrames: number;
   };
   ```

3. **`videoeditor/src/video-compositions/VideoPlayer.tsx`** — Apply the same animation using `useCurrentFrame()` in the preview.

4. **AI Tool** — Add `SetScrubberAnimation` to `tools_registry.py` and a `llmSetScrubberAnimation()` to `llm-handler.ts`.

---

### C. Adding a New Media Type (e.g., `shape`, `particle`, `lottie`)

1. **`render-server/src/composition/types.ts`**:
   ```ts
   mediaType: "video" | "image" | "audio" | "text" | "groupped_scrubber" | "subtitle" | "shape";
   // Add shape-specific properties to BaseScrubber:
   shape?: { type: "rect" | "circle" | "star"; color: string; borderRadius: number };
   ```

2. **`render-server/src/composition/TimelineComposition.tsx`** — Add `case "shape":` in `createMediaContent()`.

3. **`videoeditor/src/video-compositions/VideoPlayer.tsx`** — Add the same case to the preview's `switch` block (`switch()` node at L247).

4. **`videoeditor/src/components/timeline/Scrubber.tsx`** — Add a color/icon for the new type in `getScrubberColor()`.

5. **`backend/services/ai/tools_registry.py`** — Add `AddShape` tool entry.

6. **`videoeditor/src/utils/llm-handler.ts`** — Add `llmAddShape()` function and bind it in `ChatBox.tsx`'s `handleSendMessage()` dispatcher.

---

### D. Trim Video / Trim Audio

Trimming is **already partially implemented** — `ScrubberState` has `trimBefore` and `trimAfter` fields, and `TimelineComposition.tsx` passes them to `<OffthreadVideo>` and `<Audio>`.

**To add full UI trim support:**

1. **Scrubber UI drag handles** — `videoeditor/src/components/timeline/Scrubber.tsx`:
   - Add left/right trim handle elements (absolute positioned divs at scrubber edges).
   - On drag, call `handleUpdateScrubber({ ...scrubber, trimBefore: newValue })`.

2. **`videoeditor/src/schemas/`** — Ensure `trimBefore` / `trimAfter` persist correctly with the timeline save/load.

3. **AI Tool** (already has `ResizeScrubber` — add dedicated trim tool):
   ```python
   # tools_registry.py
   {
     "name": "TrimScrubber",
     "description": "Trim start/end of a media clip. trimBefore and trimAfter are in seconds.",
     "arguments": {
       "properties": {
         "scrubber_id": {"type": "string"},
         "trim_before_seconds": {"type": "number", "minimum": 0},
         "trim_after_seconds": {"type": "number", "minimum": 0},
       },
       "required": ["scrubber_id"],
     }
   }
   ```

4. **`videoeditor/src/utils/llm-handler.ts`** — Add:
   ```ts
   export function llmTrimScrubber(
     scrubberId: string,
     trimBeforeSeconds: number | undefined,
     trimAfterSeconds: number | undefined,
     timeline: TimelineState,
     handleUpdateScrubber: (s: ScrubberState) => void,
   ) {
     const scrubber = timeline.tracks.flatMap(t => t.scrubbers).find(s => s.id === scrubberId);
     if (!scrubber) throw new Error(`Scrubber ${scrubberId} not found`);
     handleUpdateScrubber({
       ...scrubber,
       trimBefore: trimBeforeSeconds ?? scrubber.trimBefore,
       trimAfter: trimAfterSeconds ?? scrubber.trimAfter,
     });
   }
   ```

---

### E. Mute Audio / Volume Control

1. **`render-server/src/composition/types.ts`** — Add to `BaseScrubber`:
   ```ts
   volume?: number;    // 0.0 – 1.0, default 1.0
   muted?: boolean;
   ```

2. **`render-server/src/composition/TimelineComposition.tsx`** — Pass to `<Audio>` and `<OffthreadVideo>`:
   ```tsx
   case "audio":
     content = (
       <Audio
         src={audioUrl!}
         volume={scrubber.muted ? 0 : (scrubber.volume ?? 1)}
         trimBefore={scrubber.trimBefore ?? undefined}
         trimAfter={scrubber.trimAfter ?? undefined}
       />
     );
   ```

3. **`videoeditor/src/video-compositions/VideoPlayer.tsx`** — Apply the same `volume` prop in the browser preview.

4. **AI Tools** — Add to `tools_registry.py`:
   ```python
   {"name": "MuteScrubber",   "arguments": {"properties": {"scrubber_id": {"type": "string"}}, "required": ["scrubber_id"]}},
   {"name": "UnmuteScrubber", "arguments": {"properties": {"scrubber_id": {"type": "string"}}, "required": ["scrubber_id"]}},
   {"name": "SetVolume",      "arguments": {"properties": {"scrubber_id": {"type": "string"}, "volume": {"type": "number", "minimum": 0, "maximum": 1}}, "required": ["scrubber_id", "volume"]}},
   ```

5. **`videoeditor/src/utils/llm-handler.ts`** — Add `llmMuteScrubber()`, `llmUnmuteScrubber()`, `llmSetVolume()`.

---

### F. Adding a New AI Chat Tool (General Pattern)

Every AI-callable action follows a strict three-step pattern:

#### Step 1 — Backend: Register the tool schema
**`backend/services/ai/tools_registry.py`** — append to the list in `get_tools_catalog()`:
```python
{
    "name": "MyNewTool",
    "description": "Clear description the LLM uses to decide when to call this.",
    "arguments": {
        "type": "object",
        "properties": {
            "param_one": {"type": "string", "description": "..."},
            "param_two": {"type": "number", "minimum": 0},
        },
        "required": ["param_one"],
        "additionalProperties": False,
    },
},
```

#### Step 2 — Frontend: Implement the action
**`videoeditor/src/utils/llm-handler.ts`** — add an exported function:
```ts
export function llmMyNewTool(
  paramOne: string,
  paramTwo: number,
  /* ...handler callbacks from React state... */
) {
  // Perform the timeline mutation here
}
```

#### Step 3 — Frontend: Wire the dispatch
**`videoeditor/src/components/chat/ChatBox.tsx`** — inside `handleSendMessage()`, add the case to the tool dispatcher `switch` (search for `case "AddMediaById":`):
```ts
case "MyNewTool": {
  const { param_one, param_two } = toolCall.arguments;
  llmMyNewTool(param_one, param_two ?? 0, /* handlers */);
  break;
}
```

---

## ⚡ Critical Rules

1. **Never add rendering logic only to `VideoPlayer.tsx`** — it will work in preview but break the exported video. Always mirror changes in `TimelineComposition.tsx` first.

2. **Never add rendering logic only to `TimelineComposition.tsx`** — the user will see a broken preview. Always keep both in sync.

3. **The `types.ts` in `render-server/src/composition/` is the source of truth** — it's what both the preview player (imported via path alias) and the compositor use. Never duplicate type definitions.

4. **`trimBefore` / `trimAfter` are in seconds** — `<OffthreadVideo trimBefore={N}>` skips N seconds. Validate units before passing.

5. **All new AI tools must have deterministic, idempotent behavior** — the LLM may call them multiple times. Ensure calling `MuteScrubber` twice doesn't break state.

6. **`getTransitionPresentation()` must have a default case** — always fall back to `fade()` to prevent Remotion crashes on unknown transition names.

7. **After any schema change to `types.ts`**, run `graphify update .` from the project root to keep the knowledge graph current.

8. **Backend FFmpeg routes** (`trim.py`, `export.py`) are for server-side destructive operations (burning in, pre-processing). Timeline `trimBefore`/`trimAfter` are non-destructive in Remotion. Don't conflate them.

---

## 🧪 Testing Checklist

Before marking a feature complete:
- [ ] Live preview in `videoeditor` shows the effect correctly
- [ ] Exported MP4 from `render-server` matches the preview
- [ ] AI chat command triggers the tool correctly (test with: *"mute track 2"*)
- [ ] The feature survives a page reload (state is persisted)
- [ ] No TypeScript errors in either `videoeditor` or `render-server`
- [ ] `graphify update .` run to refresh the knowledge graph
