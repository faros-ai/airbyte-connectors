// This is the default number of days to look back to check
// when a model was last added
export const defaultWithinDays = 2;

// The minimum number of dates we need to be able to
// compute a the z-score. If we don't have this many dates,
// then there are fewer than this many records, and a z-score
// is not meaningful.
export const computeNumberMinThreshold: number = 10;

// This is maximum number of dates we gather to compute the
// z-score. We get the last N dates, and then compute the z-score
// using them. The number is kept to a reasonable number to avoid
// the computational weight of gathering too many dates.
export const amountOfRecentlyAddedToCompute: number = 500;

// This threshold is used to determine if there has been a significant
// change in the timing of records added. This number represents the
// number of standard deviations away from the mean that the most recent
// date added relative to now is.
export const zScoreThreshold: number = 2;
