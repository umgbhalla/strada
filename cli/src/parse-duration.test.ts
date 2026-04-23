import { expect, test } from "vitest";
import { parseDuration } from "./parse-duration.ts";

test("parses seconds", () => {
  expect(parseDuration("30s")).toMatchInlineSnapshot(`"30 SECOND"`);
});

test("parses minutes", () => {
  expect(parseDuration("15m")).toMatchInlineSnapshot(`"15 MINUTE"`);
});

test("parses hours", () => {
  expect(parseDuration("24h")).toMatchInlineSnapshot(`"24 HOUR"`);
});

test("parses days", () => {
  expect(parseDuration("7d")).toMatchInlineSnapshot(`"7 DAY"`);
});

test("parses weeks", () => {
  expect(parseDuration("2w")).toMatchInlineSnapshot(`"2 WEEK"`);
});

test("single digit works", () => {
  expect(parseDuration("1h")).toMatchInlineSnapshot(`"1 HOUR"`);
});

test("large number works", () => {
  expect(parseDuration("365d")).toMatchInlineSnapshot(`"365 DAY"`);
});

test("throws on empty string", () => {
  expect(() => parseDuration("")).toThrow('Invalid duration ""');
});

test("throws on missing unit", () => {
  expect(() => parseDuration("24")).toThrow('Invalid duration "24"');
});

test("throws on missing number", () => {
  expect(() => parseDuration("h")).toThrow('Invalid duration "h"');
});

test("throws on unknown unit", () => {
  expect(() => parseDuration("5y")).toThrow('Invalid duration "5y"');
});

test("throws on decimal", () => {
  expect(() => parseDuration("1.5h")).toThrow('Invalid duration "1.5h"');
});

test("throws on negative", () => {
  expect(() => parseDuration("-1h")).toThrow('Invalid duration "-1h"');
});

test("throws on spaces", () => {
  expect(() => parseDuration("1 h")).toThrow('Invalid duration "1 h"');
});
