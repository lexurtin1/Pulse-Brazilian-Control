/**
 * A minimal, dependency-free ZIP reader.
 *
 * Both of the Office formats this app ingests — .xlsx and .docx — are ZIP
 * containers of XML, so the container handling lives here rather than being
 * written twice. Nothing beyond reading entries belongs in this file; the
 * format-specific XML parsing stays with each reader.
 */

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new DecompressionStream("deflate-raw");
  const written = (async () => {
    const writer = stream.writable.getWriter();
    await writer.write(data);
    await writer.close();
  })();
  const inflated = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await written;
  return inflated;
}

/**
 * Reads the ZIP central directory rather than walking local file headers —
 * a local header may defer its sizes to a trailing data descriptor, the
 * central directory never does.
 *
 * `formatLabel` names the format in the error a non-ZIP file produces, so
 * someone who uploaded the wrong thing is told what was expected.
 */
export async function unzip(buffer: ArrayBuffer, formatLabel = "Office"): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let endOfCentralDirectory = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOfCentralDirectory = i;
      break;
    }
  }
  if (endOfCentralDirectory < 0) {
    throw new Error(`This doesn't look like a${formatLabel === "Excel" ? "n" : ""} ${formatLabel} file — no ZIP end-of-central-directory record found.`);
  }

  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  let offset = view.getUint32(endOfCentralDirectory + 16, true);
  if (offset === 0xffffffff) throw new Error(`ZIP64 ${formatLabel} files are not supported.`);

  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const utf8 = new TextDecoder("utf-8");

  for (let entry = 0; entry < entryCount; entry++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      files.set(name, data);
    } else if (method === 8) {
      files.set(name, await inflateRaw(data));
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}
