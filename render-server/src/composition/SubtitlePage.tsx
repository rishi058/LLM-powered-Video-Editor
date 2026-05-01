import React from "react";
import { AbsoluteFill } from "remotion";
import { type TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", { weights: ["400"] });

const DESIRED_FONT_SIZE = 35;

export const SubtitlePage: React.FC<{
  readonly page: TikTokPage;
}> = ({ page }) => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: "8%",
      }}
    >
      <div
        style={{
          opacity: 1,
          textAlign: "center",
          maxWidth: "85%",
          fontSize: DESIRED_FONT_SIZE,
          fontFamily,
          fontWeight: 700,
          color: "#ffffff",
          WebkitTextStroke: "2px #000000",
          textShadow:
            "0px 2px 8px rgba(0,0,0,0.85), 0px 0px 2px rgba(0,0,0,1)",
          letterSpacing: "0.02em",
          lineHeight: 1.25,
          paintOrder: "stroke fill",
        }}
      >
        {page.text}
      </div>
    </AbsoluteFill>
  );
};
