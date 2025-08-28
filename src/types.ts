/**
 * Common types used throughout the application
 */

export type JsonObject = Record<string, unknown>;
export type JsonArray = unknown[];
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

export type ErrorResponse = {
  type: string;
  detail: string;
  status?: number;
  instance?: string;
  subproblems?: ErrorResponse[];
};
