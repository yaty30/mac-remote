import { TEXT_SEND_CHUNK_SIZE } from "../../keyboard/constants";
import type { KeyboardSelection } from "./types";

export interface KeyboardTextDiff {
  deletedCount: number;
  insertedText: string;
  syncCursorIndex: number;
}

export function splitTextIntoRemoteChunks(
  text: string,
  chunkSize = TEXT_SEND_CHUNK_SIZE,
) {
  return text.split("\n").flatMap((piece, index, pieces) => {
    const chunks: Array<{ type: "text" | "enter"; value?: string }> = [];

    for (let offset = 0; offset < piece.length; offset += chunkSize) {
      chunks.push({
        type: "text",
        value: piece.slice(offset, offset + chunkSize),
      });
    }

    if (index < pieces.length - 1) {
      chunks.push({ type: "enter" });
    }

    return chunks;
  });
}

export function diffKeyboardText(prev: string, nextText: string): KeyboardTextDiff {
  let prefixLength = 0;
  while (
    prefixLength < prev.length &&
    prefixLength < nextText.length &&
    prev[prefixLength] === nextText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < prev.length - prefixLength &&
    suffixLength < nextText.length - prefixLength &&
    prev[prev.length - 1 - suffixLength] ===
      nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const deletedCount = prev.length - prefixLength - suffixLength;
  const insertedText = nextText.slice(
    prefixLength,
    nextText.length - suffixLength,
  );

  return {
    deletedCount,
    insertedText,
    syncCursorIndex: prefixLength + deletedCount,
  };
}

export function getBoundedSelection(
  selection: KeyboardSelection,
  textLength: number,
) {
  const selectionStart = Math.max(
    0,
    Math.min(selection.start, selection.end),
  );
  const selectionEnd = Math.min(
    textLength,
    Math.max(selection.start, selection.end),
  );

  return {
    selectionEnd,
    selectionStart,
  };
}

export function replaceKeyboardSelection(
  prev: string,
  selection: KeyboardSelection,
  text: string,
) {
  const { selectionEnd, selectionStart } = getBoundedSelection(
    selection,
    prev.length,
  );

  return {
    nextCursor: selectionStart + text.length,
    nextText: prev.slice(0, selectionStart) + text + prev.slice(selectionEnd),
    selectionEnd,
    selectionStart,
  };
}
