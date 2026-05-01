# Workflow: Add New Video Editing Feature

> **Trigger**: Use this workflow when asked to add any new feature to the video editor —
> transitions, animations, effects, media types, trim/mute/volume controls, or new AI chat tools.

<!-- turbo-all -->

## Prerequisites

Before starting, read the rule file and query the graph:

```
@rule: .agents/rules/add-video-feature.md
```

---

## Step 1 — Identify Feature Category

Determine which category the feature belongs to (can be multiple):

| Category | Primary Files |
|---|---|
| New Transition (visual) | `types.ts` → `TimelineComposition.tsx` → `VideoPlayer.tsx` |
| New Animation / Motion Effect | `types.ts` → `TimelineComposition.tsx` → `VideoPlayer.tsx` |
| New Media Type | `types.ts` → both renderers → `Scrubber.tsx` |
| Trim / In-Out Points | `types.ts` (already has fields) → Scrubber UI handles |
| Mute / Volume | `types.ts` → both renderers → `llm-handler.ts` |
| New AI Chat Tool | `tools_registry.py` → `llm-handler.ts` → `ChatBox.tsx` |
| Backend Processing | `backend/routes/video_editing/` new `.py` file |

---

## Step 2 — Query the Knowledge Graph

Use graphify to understand the current state before making changes:

```bash
# Query relevant nodes before editing
# (Use MCP graphify tools directly in the agent)
```

Key queries to run:
- `query_graph("transition presentation getTransitionPresentation")` — before adding transitions
- `query_graph("createMediaContent switch mediaType")` — before adding media types
- `query_graph("tools_registry get_tools_catalog")` — before adding AI tools
- `get_node("TimelineComposition.tsx")` — to confirm current composition structure
- `get_node("llm-handler.ts")` — to confirm current handler structure

---

## Step 3 — Update the Type Contract

**File**: `render-server/src/composition/types.ts`

This is the **shared source of truth**. All layers import from here.

**For new transitions**, extend the union:
```ts
presentation: "fade" | "wipe" | "clockWipe" | "slide" | "flip" | "iris" | "NEW_NAME";
```

**For new scrubber properties**, extend `BaseScrubber`:
```ts
export interface BaseScrubber {
  // ... existing fields ...
  volume?: number;        // NEW: 0.0–1.0
  muted?: boolean;        // NEW
  animation?: AnimationConfig;  // NEW
}
```

**For new media types**, extend the union:
```ts
mediaType: "video" | "image" | "audio" | "text" | "groupped_scrubber" | "subtitle" | "NEW_TYPE";
```

---

## Step 4 — Update the Remotion Compositor (Source of Truth for Render)

**File**: `render-server/src/composition/TimelineComposition.tsx`

### For Transitions:
Add import at the top:
```ts
import { yourTransition } from "@remotion/transitions/your-transition";
```
Add case in `getTransitionPresentation()`:
```ts
case "yourTransition": return yourTransition({ /* options */ });
```

### For Animations:
Create `render-server/src/composition/animations/YourAnimation.tsx`:
```tsx
import { useCurrentFrame, interpolate, AbsoluteFill } from "remotion";

export function YourAnimation({ children, durationInFrames }: { children: React.ReactNode; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ /* apply animated style using progress */ }}>
      {children}
    </AbsoluteFill>
  );
}
```

Then wrap in `createMediaContent()` in `TimelineComposition.tsx`.

### For New Media Types:
Add a `case "newType":` inside `createMediaContent()` switch block.

### For Volume/Mute:
Update the `case "audio":` and `case "video":` blocks:
```tsx
<Audio
  src={audioUrl!}
  volume={scrubber.muted ? 0 : (scrubber.volume ?? 1)}
  trimBefore={scrubber.trimBefore ?? undefined}
  trimAfter={scrubber.trimAfter ?? undefined}
/>
```

---

## Step 5 — Mirror in the Live Preview Player

**File**: `videoeditor/src/video-compositions/VideoPlayer.tsx`

The preview player has its **own parallel implementation** of the same rendering logic.
Every change in Step 4 MUST be mirrored here.

- `switch()` at L247 — media type renderer  
- Any transition or animation logic must be duplicated

> ⚠️ Skipping this step means the user sees a broken preview even when the export works correctly.

---

## Step 6 — Register the AI Tool (if applicable)

**File**: `backend/services/ai/tools_registry.py`

Append to the `return [...]` list in `get_tools_catalog()`:

```python
{
    "name": "ToolName",            # PascalCase, stable identifier
    "description": "One sentence. Be precise about what it does and when to use it.",
    "arguments": {
        "type": "object",
        "properties": {
            "scrubber_id": {"type": "string", "description": "ID of the target scrubber"},
            "value":       {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["scrubber_id"],
        "additionalProperties": False,
    },
},
```

**Rules for tool schema:**
- Use `snake_case` for argument names
- Always add `"description"` to ambiguous parameters
- Mark the minimum required params in `"required"` — keep it lean
- Add `"additionalProperties": False` to prevent hallucinated fields

---

## Step 7 — Implement the AI Tool Handler

**File**: `videoeditor/src/utils/llm-handler.ts`

Add an exported function following existing naming convention `llm<ToolName>`:

```ts
// ============================
// YOUR FEATURE SECTION HEADER
// ============================

export function llmToolName(
  scrubberId: string,
  value: number,
  timeline: TimelineState,
  handleUpdateScrubber: (updatedScrubber: ScrubberState) => void,
) {
  const allScrubbers = timeline.tracks.flatMap((track) => track.scrubbers);
  const scrubber = allScrubbers.find((s) => s.id === scrubberId);
  if (!scrubber) {
    throw new Error(`Scrubber with id ${scrubberId} not found`);
  }
  
  const updatedScrubber: ScrubberState = {
    ...scrubber,
    // Apply the change
    volume: value,
  };
  
  handleUpdateScrubber(updatedScrubber);
}
```

---

## Step 8 — Wire the Dispatcher in ChatBox

**File**: `videoeditor/src/components/chat/ChatBox.tsx`

Find the `handleSendMessage()` function (L405) and locate the `switch` block that dispatches tool calls (search for `case "AddMediaById":`).

Add your new case:
```ts
case "ToolName": {
  const { scrubber_id, value } = toolCall.arguments as {
    scrubber_id: string;
    value: number;
  };
  llmToolName(scrubber_id, value, timeline, handleUpdateScrubber);
  break;
}
```

Import the handler at the top of the file:
```ts
import { llmToolName } from "~/utils/llm-handler";
```

---

## Step 9 — Add UI Controls (if the feature needs manual interaction)

For features with a UI control (e.g. trim handles, volume slider, mute button):

**Timeline scrubber UI**: `videoeditor/src/components/timeline/Scrubber.tsx`
- `getScrubberColor()` — add color for new media types
- Add drag handles for trim (left/right edge resize)
- Add context menu items

**Track controls**: `videoeditor/src/components/timeline/TrackActionButton.tsx`
- Add per-track buttons (e.g., mute track, solo track)

**Inspector/Properties panel**: Create or extend a properties sidebar for selected scrubber.

---

## Step 10 — Backend Route (if server-side processing is needed)

Only needed for **destructive/computational operations** (FFmpeg pre-processing, AI generation, etc.).

Create `backend/routes/video_editing/your_feature.py`:
```python
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class YourFeatureRequest(BaseModel):
    file_path: str
    # ...

@router.post("/your-feature")
async def your_feature(req: YourFeatureRequest):
    # FFmpeg / processing logic
    return {"result": "..."}
```

Register in `backend/routes/video_editing/__init__.py`:
```python
from .your_feature import router as your_feature_router
# include router in the FastAPI app
```

---

## Step 11 — Update Graphify Knowledge Graph

After completing all code changes:

```bash
# Run from d:\STUDY 2\MediaEditor
graphify update .
```

This regenerates the AST-based graph at no API cost, keeping future agent queries accurate.

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---|---|
| Only updating `VideoPlayer.tsx` | Always update `TimelineComposition.tsx` too |
| Only updating `TimelineComposition.tsx` | Always update `VideoPlayer.tsx` too |
| Adding `trimBefore` in frames instead of seconds | `trimBefore` is in **seconds** for Remotion's `<OffthreadVideo>` |
| Forgetting `default:` case in transition switch | Always return `fade()` as fallback |
| Not importing the new `llm*` function in `ChatBox.tsx` | Add to imports at top of file |
| Using `additionalProperties: True` in strict tools | Use `False` to prevent hallucinated args |
| Mutating state directly in llm-handler | Always spread: `{ ...scrubber, newProp: value }` |
