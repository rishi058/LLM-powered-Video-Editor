import { Composition, getInputProps } from "remotion";
import { TimelineComposition } from "./TimelineComposition";

export default function RenderComposition() {
  const inputProps = getInputProps();
  console.log("Input props:", inputProps);
  return (
    <Composition
      id="TimelineComposition"
      component={TimelineComposition}
      durationInFrames={(inputProps.durationInFrames as number) ?? 300}
      fps={30}
      width={inputProps.compositionWidth as number}
      height={inputProps.compositionHeight as number}
      defaultProps={{
        timelineData: [
          {
            scrubbers: [
              {
                id: "1-1",
                startTime: 0,
                endTime: 3,
                duration: 3,
                width: 300,
                durationInSeconds: 3,
                mediaType: "text",
                media_width: 80,
                media_height: 80,
                mediaUrlLocal: null,
                mediaUrlRemote: null,
                text: {
                  textContent: "Hello, world!",
                  fontSize: 16,
                  fontFamily: "Arial",
                  color: "#000000",
                  textAlign: "left",
                  fontWeight: "normal",
                  template: null,
                },
                left_player: 100,
                top_player: 100,
                width_player: 200,
                height_player: 200,
                trackIndex: 0,
                trimBefore: null,
                trimAfter: null,
                left_transition_id: null,
                right_transition_id: null,
                groupped_scrubbers: null,
                subtitleData: null,
              },
            ],
            transitions: {},
          },
        ],
        isRendering: false,
        selectedItem: null,
        setSelectedItem: () => {},
        timeline: { tracks: [] },
        handleUpdateScrubber: () => {},
        getPixelsPerSecond: () => 100,
      }}
    />
  );
}
