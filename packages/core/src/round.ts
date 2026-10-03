// Port of GstCalculator.round2 / roundOff (MDA-Inventory lib/posting_service.dart:101,139).
//
// Dart's roundToDouble() rounds halves AWAY from zero; JavaScript's Math.round rounds them
// toward +Infinity, so Math.round(-12.5) is -12 where Dart gives -13. Mirror Dart exactly.

/** Dart `double.roundToDouble()`: nearest integer, halves away from zero. */
export const roundHalfAway = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

/** `(v * 100).roundToDouble() / 100` */
export const round2 = (v: number): number => roundHalfAway(v * 100) / 100;

/** Difference between an amount and its nearest rupee. */
export const roundOff = (net: number): number => round2(roundHalfAway(net) - net);
