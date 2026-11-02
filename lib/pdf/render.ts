import "server-only";
import type { ReactElement } from "react";
import { Font, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

let queue: Promise<unknown> = Promise.resolve();

/**
 * A PDF, with its fonts read afresh, one at a time. react-pdf keeps a font's glyphs from one
 * document to the next: a later PDF from the same server lost letters ("his certifies that")
 * or carried text that copies as gibberish.
 */
export function renderPdf(document: ReactElement<DocumentProps>): Promise<Buffer> {
  const run = queue.then(() => {
    for (const family of Object.values(Font.getRegisteredFonts())) {
      for (const source of family.sources) {
        source.data = null;
        source.loadResultPromise = null;
      }
    }
    return renderToBuffer(document);
  });
  queue = run.catch(() => undefined);
  return run;
}
