import { useEffect, useState, useCallback } from "preact/hooks";
import {
  tutorialActive,
  tutorialStep,
  tutorialSteps,
  nextStep,
  prevStep,
  skipTutorial,
} from "../state/tutorial.js";

const PADDING = 8;
const TOOLTIP_GAP = 12;
const VIEWPORT_MARGIN = 12;

function getRect(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.x - PADDING,
    y: r.y - PADDING,
    w: r.width + PADDING * 2,
    h: r.height + PADDING * 2,
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function TutorialOverlay() {
  const [rect, setRect] = useState(null);
  const active = tutorialActive.value;
  const stepIdx = tutorialStep.value;
  const step = tutorialSteps[stepIdx];
  const isWaiting = step?.waitFor ? !step.waitFor() : false;

  const measure = useCallback(() => {
    if (!active) return;
    const step = tutorialSteps[stepIdx];
    if (!step) return;
    const r = getRect(step.target);
    if (r) {
      setRect(r);
    } else {
      // Target not found — skip to next step
      nextStep();
    }
  }, [active, stepIdx]);

  // Re-measure periodically for waitFor steps (target may appear late)
  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);

    // For waitFor steps, poll for the target element in case it mounts later
    let pollId;
    if (step?.waitFor && !rect) {
      pollId = setInterval(measure, 500);
    }
    return () => {
      window.removeEventListener("resize", measure);
      if (pollId) clearInterval(pollId);
    };
  }, [active, stepIdx, measure]);

  if (!active || !rect) return null;

  const totalSteps = tutorialSteps.length;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Compute tooltip position
  const tooltipW = 300;
  const tooltipH = 180; // estimated
  let tooltipX, tooltipY;

  switch (step.position) {
    case "right":
      tooltipX = rect.x + rect.w + TOOLTIP_GAP;
      tooltipY = rect.y;
      break;
    case "left":
      tooltipX = rect.x - tooltipW - TOOLTIP_GAP;
      tooltipY = rect.y;
      break;
    case "bottom":
      tooltipX = rect.x;
      tooltipY = rect.y + rect.h + TOOLTIP_GAP;
      break;
    case "top":
      tooltipX = rect.x;
      tooltipY = rect.y - tooltipH - TOOLTIP_GAP;
      break;
    default:
      tooltipX = rect.x + rect.w + TOOLTIP_GAP;
      tooltipY = rect.y;
  }

  // Viewport clamp
  tooltipX = clamp(tooltipX, VIEWPORT_MARGIN, vw - tooltipW - VIEWPORT_MARGIN);
  tooltipY = clamp(tooltipY, VIEWPORT_MARGIN, vh - tooltipH - VIEWPORT_MARGIN);

  return (
    <div class="tutorial-overlay" onClick={skipTutorial}>
      <svg class="tutorial-svg" viewBox={`0 0 ${vw} ${vh}`}>
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight ring */}
      <div
        class="tutorial-highlight-ring"
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.w}px`,
          height: `${rect.h}px`,
        }}
      />

      {/* Tooltip */}
      <div
        class="tutorial-tooltip"
        style={{
          left: `${tooltipX}px`,
          top: `${tooltipY}px`,
          width: `${tooltipW}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="tutorial-tooltip-header">
          <span class="tutorial-step-counter">
            {stepIdx + 1} / {totalSteps}
          </span>
          <button class="tutorial-btn-skip" onClick={skipTutorial}>
            Skip
          </button>
        </div>
        <h3 class="tutorial-tooltip-title">{step.title}</h3>
        <p class="tutorial-tooltip-body">{step.body}</p>
        <div class="tutorial-tooltip-footer">
          <div class="tutorial-dots">
            {tutorialSteps.map((_, i) => (
              <span
                key={i}
                class={`tutorial-dot${i === stepIdx ? " active" : ""}`}
              />
            ))}
          </div>
          <div class="tutorial-nav-btns">
            {stepIdx > 0 && !isWaiting && (
              <button class="tutorial-btn-back" onClick={prevStep}>
                Back
              </button>
            )}
            <button
              class="tutorial-btn-next"
              onClick={nextStep}
              disabled={isWaiting}
              style={isWaiting ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {isWaiting
                ? "Waiting..."
                : stepIdx === totalSteps - 1
                  ? "Done"
                  : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
