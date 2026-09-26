// Dashboard presentational pieces. Split out of the 679-line Dashboard so the
// page file becomes composition instead of a state machine. Nothing here owns
// data-fetching state; every one of these takes props.
//
// The rule that governs all of them: this product's value is that it reports
// failure honestly, so a failure state gets the same care, the same geometry
// and the same status grammar as a success. Nothing here invents a value.

export { StatCounter, type Stat } from "../ui/stat-counter";
export { TargetCardSkeleton, SkeletonSlot, Bone } from "../ui/skeleton-loader";
export { LiveIndicator, useWorkIndicator } from "../ui/live-indicator";
