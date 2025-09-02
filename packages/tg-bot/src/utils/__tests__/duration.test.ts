import { describe, it } from "node:test";
import { Time } from "../../enums/Time.ts";
import { formatDuration, parseDuration } from "../duration.ts";

describe("formatDuration", () => {
	it("represents duration in the smallest required value up to days", (t) => {
		t.assert.equal(formatDuration(42), "42ms", "milliseconds");
		t.assert.equal(formatDuration(42 * Time.Seconds), "42s", "seconds");
		t.assert.equal(formatDuration(42 * Time.Minutes), "42m", "minutes");
		t.assert.equal(formatDuration(3 * Time.Hours), "3h", "hours");
		t.assert.equal(formatDuration(3 * Time.Days), "3d", "days");
	});

	it("represents compound durations", (t) => {
		t.assert.equal(formatDuration(1 * Time.Days + 2 * Time.Hours + 3 * Time.Minutes), "1d2h3m", "days");
		t.assert.equal(formatDuration(1 * Time.Hours + 2 * Time.Minutes + 3 * Time.Seconds), "1h2m3s", "hours");
		t.assert.equal(formatDuration(1 * Time.Minutes + 2 * Time.Seconds + 3), "1m2s3ms", "minutes");
	});

	it("doesn't include extra compound durations if not necessary", (t) => {
		t.assert.equal(formatDuration(1 * Time.Days + 2 * Time.Hours), "1d2h", "days");
		t.assert.equal(formatDuration(1 * Time.Hours + 2 * Time.Minutes), "1h2m", "hours");
		t.assert.equal(formatDuration(1 * Time.Minutes + 2 * Time.Seconds), "1m2s", "minutes");
	});

	it("omits middle component in compound duration if needed", (t) => {
		t.assert.equal(formatDuration(1 * Time.Days + 3 * Time.Minutes), "1d3m", "days");
		t.assert.equal(formatDuration(1 * Time.Hours + 3 * Time.Seconds), "1h3s", "hours");
		t.assert.equal(formatDuration(1 * Time.Minutes + 3), "1m3ms", "minutes");
	});

	it("doesn't provide more granularity, then 3 components by default", (t) => {
		const dur = 1 * Time.Days + 2 * Time.Hours + 3 * Time.Minutes + 4 * Time.Seconds + 5;
		t.assert.equal(formatDuration(dur), "1d2h3m", "days");
	});

	it("allows to control the amount of components to output", (t) => {
		const dur = 1 * Time.Days + 2 * Time.Hours + 3 * Time.Minutes + 4 * Time.Seconds + 5;
		t.assert.equal(formatDuration(dur, { maxComponents: 4 }), "1d2h3m4s", "4");
		t.assert.equal(formatDuration(dur, { maxComponents: 5 }), "1d2h3m4s5ms", "5");
	});

	it("allows to specify the smallest unit", (t) => {
		const dur = 1 * Time.Days + 2 * Time.Hours + 3 * Time.Minutes + 4 * Time.Seconds + 5;
		t.assert.equal(formatDuration(dur, { smallestUnit: "h" }), "1d2h", "up to hours");
		t.assert.equal(formatDuration(20 * Time.Seconds, { smallestUnit: "m" }), "0m", "don't go bellow -- adds suffix");
		t.assert.equal(formatDuration(20 * Time.Seconds, { smallestUnit: "s" }), "20s");
		t.assert.equal(formatDuration(20 * Time.Seconds + 100, { smallestUnit: "s" }), "20s");
		t.assert.equal(formatDuration(0, { smallestUnit: "m" }), "0", "the real zero duration is just zero");
	});

	it("amount of components to output takes precedence over the smallest unit", (t) => {
		const dur = 1 * Time.Days + 2 * Time.Hours + 3 * Time.Minutes + 4 * Time.Seconds + 5;
		t.assert.equal(formatDuration(dur, { smallestUnit: "s" }), "1d2h3m", "default 3 components");
		t.assert.equal(formatDuration(dur, { maxComponents: 2, smallestUnit: "s" }), "1d2h", "2 components");
		t.assert.equal(
			formatDuration(20 * Time.Seconds + 100, { maxComponents: 2, smallestUnit: "s" }),
			"20s",
			"2 components",
		);
		t.assert.equal(formatDuration(20 * Time.Seconds + 100, { maxComponents: 2 }), "20s100ms", "2 components");
	});
});

describe("duration", () => {
	it("parses the provided duration value", (t) => {
		t.assert.equal(parseDuration("3h"), 3 * Time.Hours);
		t.assert.equal(parseDuration("3m"), 3 * Time.Minutes);
		t.assert.equal(parseDuration("3s"), 3 * Time.Seconds);
	});

	it("parses the provided compound durations", (t) => {
		t.assert.equal(parseDuration("3h10m"), 3 * Time.Hours + 10 * Time.Minutes);
		t.assert.equal(parseDuration("3m10s"), 3 * Time.Minutes + 10 * Time.Seconds);
		t.assert.equal(parseDuration("3s10ms"), 3 * Time.Seconds + 10);
	});

	it("compound duration can omit components", (t) => {
		t.assert.equal(parseDuration("3h10s"), 3 * Time.Hours + 10 * Time.Seconds);
	});

	it("compound duration can have zero values", (t) => {
		t.assert.equal(parseDuration("3h0m10s"), 3 * Time.Hours + 10 * Time.Seconds);
	});

	it("zero is always zero", (t) => {
		t.assert.equal(parseDuration("0h"), 0);
		t.assert.equal(parseDuration("0"), 0);
	});

	it("allows fractional values", (t) => {
		t.assert.equal(parseDuration("0.5h"), 30 * Time.Minutes);
		t.assert.equal(parseDuration(".5h"), 30 * Time.Minutes);
		t.assert.equal(parseDuration("0.5h0.25m"), 30 * Time.Minutes + 15 * Time.Seconds);
		t.assert.equal(parseDuration("0.5h.25m"), 30 * Time.Minutes + 15 * Time.Seconds);
	});

	it("parses negative durations as well", (t) => {
		t.assert.equal(parseDuration("-3h10m"), -(3 * Time.Hours + 10 * Time.Minutes));
		t.assert.equal(parseDuration("-.5h"), -30 * Time.Minutes);
	});

	it("unknown prefixes or malformed strings results in NaN", (t) => {
		t.assert.equal(parseDuration("12q2m"), NaN);
		t.assert.equal(parseDuration("deadbeef"), NaN);
	});

	it("out of order components is a NaN", (t) => {
		t.assert.equal(parseDuration("10m3h"), NaN);
	});

	it("doesn't parse just a number, unless default granularity is provided", (t) => {
		t.assert.equal(parseDuration("12"), NaN);
		t.assert.equal(parseDuration("12", "m"), 12 * Time.Minutes);
	});

	it("bad default granularity result in an exception", (t) => {
		// @ts-expect-error bad granularity value
		t.assert.throws(() => parseDuration("12", "q"), TypeError);
	});
});
