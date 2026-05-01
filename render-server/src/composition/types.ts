// base type for all scrubbers
export interface BaseScrubber {
  id: string;
  mediaType: "video" | "image" | "audio" | "text" | "groupped_scrubber" | "subtitle";
  mediaUrlLocal: string | null;
  mediaUrlRemote: string | null;
  media_width: number;
  media_height: number;

  text: TextProperties | null;
  subtitleData: unknown | null;
  groupped_scrubbers: ScrubberState[] | null;

  left_transition_id: string | null;
  right_transition_id: string | null;
}

export interface Transition {
  id: string;
  presentation: "fade" | "wipe" | "clockWipe" | "slide" | "flip" | "iris";
  timing: "spring" | "linear";
  durationInFrames: number;
  leftScrubberId: string | null;
  rightScrubberId: string | null;
}

export interface TextProperties {
  textContent: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  textAlign: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  template: "normal" | "glassy" | null;
}

export interface MediaBinItem extends BaseScrubber {
  name: string;
  durationInSeconds: number;
  uploadProgress: number | null;
  isUploading: boolean;
}

export interface ScrubberState extends MediaBinItem {
  left: number;
  y: number;
  width: number;
  sourceMediaBinId: string;

  left_player: number;
  top_player: number;
  width_player: number;
  height_player: number;
  is_dragging: boolean;

  trimBefore: number | null;
  trimAfter: number | null; // frames trimmed from the end of the source media
}

export interface TrackState {
  id: string;
  scrubbers: ScrubberState[];
  transitions: Transition[];
}

export interface TimelineState {
  tracks: TrackState[];
}

export interface TimelineDataItem {
  scrubbers: (BaseScrubber & {
    width: number;
    durationInSeconds: number;
    startTime: number;
    endTime: number;
    duration: number;
    trackIndex: number;

    left_player: number;
    top_player: number;
    width_player: number;
    height_player: number;

    trimBefore: number | null;
    trimAfter: number | null; // frames trimmed from the end of the source media
  })[];
  transitions: { [id: string]: Transition };
}

// Constants
export const PIXELS_PER_SECOND = 100;
export const DEFAULT_TRACK_HEIGHT = 52;
export const FPS = 30;
export const RULER_HEIGHT = 24;
