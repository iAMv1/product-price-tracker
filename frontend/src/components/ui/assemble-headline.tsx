import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

/**
 * A headline whose words assemble themselves on arrival: each word rises,
 * un-blurs and settles, staggered left to right.
 *
 * This is the landing's opening beat, so it is the one place a choreographed
 * entrance is worth the weight — but the words stay real text in the DOM, so
 * the sentence is readable to a screen reader and to a crawler, and it is
 * readable even before JS runs.
 *
 * Under prefers-reduced-motion every word is simply present: no translate, no
 * blur, no stagger.
 */
export function AssembleHeadline({
  text,
  className,
  /** Wrap a word or phrase in <em> by passing an array of tokens. */
  emphasis,
}: {
  text: string;
  className?: string;
  /** Index (0-based) of the word to render in the italic voice colour. */
  emphasis?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  // Enough to read as a sentence assembling, not a slot machine.
  const step = 0.08;
  const last = words.length - 1;

  return (
    <span className={cn("inline", className)}>
      {words.map((word, i) => {
        const isEm = emphasis !== undefined && i >= emphasis;
        return (
          // The separating space must sit OUTSIDE the inline-block wrapper:
          // trailing whitespace inside an inline-block collapses away, and
          // the words would render jammed together ("Thestorelies.").
          <Fragment key={`${word}-${i}`}>
            <span className="inline-block overflow-hidden align-bottom">
              <motion.span
                className={cn("inline-block", isEm && "italic text-muted")}
                initial={
                  reduce
                    ? false
                    : { opacity: 0, y: "0.5em", rotate: 1.2, filter: "blur(6px)" }
                }
                animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
                transition={{
                  duration: 0.72,
                  // The last word is the payoff ("doesn't."), so it gets a
                  // slightly longer settle than the run-up.
                  delay: 0.05 + i * step + (i === last ? 0.08 : 0),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {word}
              </motion.span>
            </span>
            {i < last ? " " : ""}
          </Fragment>
        );
      })}
    </span>
  );
}