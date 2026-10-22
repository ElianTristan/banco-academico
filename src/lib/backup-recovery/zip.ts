import zlib from "node:zlib";

export interface ZipFileEntry {
  name: string;
  content: string | Buffer;
}

export interface ExtractedZipEntry {
  name: string;
  content: Buffer;
}

/**
 * Genera un archivo binario ZIP estándar utilizando compresión Deflate y CRC-32.
 * Compatible con cualquier descompresor estándar (macOS, Windows, Linux, Info-ZIP).
 */
export function createZipArchive(files: ZipFileEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const normalizedName = file.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBuf = Buffer.from(normalizedName, "utf8");
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const uncompressedSize = dataBuf.length;
    const crc = zlib.crc32(dataBuf);
    const compressedBuf = zlib.deflateRawSync(dataBuf);
    const compressedSize = compressedBuf.length;

    // Encabezado local de archivo (30 bytes + nombre)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose flags
    localHeader.writeUInt16LE(8, 8); // Method: 8 = Deflate
    localHeader.writeUInt16LE(0, 10); // Last mod time
    localHeader.writeUInt16LE(0x5021, 12); // Last mod date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuf.copy(localHeader, 30);

    const localOffset = offset;
    localHeaders.push(localHeader, compressedBuf);
    offset += localHeader.length + compressedBuf.length;

    // Entrada del directorio central (46 bytes + nombre)
    const centralDir = Buffer.alloc(46 + nameBuf.length);
    centralDir.writeUInt32LE(0x02014b50, 0); // Signature
    centralDir.writeUInt16LE(20, 4); // Version made by (2.0)
    centralDir.writeUInt16LE(20, 6); // Version needed
    centralDir.writeUInt16LE(0, 8); // General purpose flags
    centralDir.writeUInt16LE(8, 10); // Method: Deflate
    centralDir.writeUInt16LE(0, 12); // Last mod time
    centralDir.writeUInt16LE(0x5021, 14); // Last mod date
    centralDir.writeUInt32LE(crc, 16); // CRC-32
    centralDir.writeUInt32LE(compressedSize, 20); // Compressed size
    centralDir.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralDir.writeUInt16LE(nameBuf.length, 28); // Filename length
    centralDir.writeUInt16LE(0, 30); // Extra field length
    centralDir.writeUInt16LE(0, 32); // File comment length
    centralDir.writeUInt16LE(0, 34); // Disk number start
    centralDir.writeUInt16LE(0, 36); // Internal file attributes
    centralDir.writeUInt32LE(0, 38); // External file attributes
    centralDir.writeUInt32LE(localOffset, 42); // Relative offset of local header
    nameBuf.copy(centralDir, 46);
    centralDirs.push(centralDir);
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDirs) cdSize += cd.length;

  // Registro de fin de directorio central (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk with central directory
  eocd.writeUInt16LE(files.length, 8); // Number of central dir records on this disk
  eocd.writeUInt16LE(files.length, 10); // Total number of central dir records
  eocd.writeUInt32LE(cdSize, 12); // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16); // Offset of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralDirs, eocd]);
}

/**
 * Lee y extrae el contenido de un archivo ZIP binario, verificando firmas y CRC-32.
 */
export function readZipArchive(buffer: Buffer): ExtractedZipEntry[] {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error("El archivo proporcionado no es un archivo ZIP válido (tamaño insuficiente).");
  }

  // Buscar el End of Central Directory (EOCD) desde el final
  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length, 65557);
  for (let i = buffer.length - 22; i >= buffer.length - maxSearch; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Estructura de archivo corrupta o no reconocida: no se localizó la firma EOCD de ZIP.");
  }

  const entriesCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset > buffer.length) {
    throw new Error("El archivo ZIP está incompleto o truncado.");
  }

  const entries: ExtractedZipEntry[] = [];
  let pointer = cdOffset;

  for (let i = 0; i < entriesCount; i++) {
    if (pointer + 46 > buffer.length) {
      throw new Error("Directorio central de ZIP truncado.");
    }

    const signature = buffer.readUInt32LE(pointer);
    if (signature !== 0x02014b50) {
      throw new Error(`Entrada de directorio central inválida en posición ${pointer}.`);
    }

    const method = buffer.readUInt16LE(pointer + 10);
    const expectedCrc = buffer.readUInt32LE(pointer + 16);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLen = buffer.readUInt16LE(pointer + 28);
    const extraLen = buffer.readUInt16LE(pointer + 30);
    const commentLen = buffer.readUInt16LE(pointer + 32);
    const localHeaderOffset = buffer.readUInt32LE(pointer + 42);

    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLen);

    // Leer encabezado local correspondiente
    if (localHeaderOffset + 30 > buffer.length) {
      throw new Error(`Encabezado local fuera de límites para ${name}.`);
    }

    const localSig = buffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      throw new Error(`Firma de archivo local corrupta para el archivo ${name}.`);
    }

    const lhNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) {
      throw new Error(`Datos truncados para el archivo ${name} dentro del paquete ZIP.`);
    }

    const compressedData = buffer.subarray(dataStart, dataEnd);
    let decompressed: Buffer;

    if (method === 0) {
      // Sin compresión (Store)
      decompressed = Buffer.from(compressedData);
    } else if (method === 8) {
      // Compresión Deflate
      try {
        decompressed = zlib.inflateRawSync(compressedData);
      } catch (err) {
        throw new Error(`Fallo de descompresión en archivo ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      throw new Error(`Método de compresión ZIP no compatible (${method}) en archivo ${name}.`);
    }

    if (decompressed.length !== uncompressedSize) {
      throw new Error(`El tamaño descomprimido de ${name} no coincide con el valor esperado.`);
    }

    const actualCrc = zlib.crc32(decompressed);
    if (actualCrc !== expectedCrc) {
      throw new Error(`Suma de verificación CRC-32 no coincide en ${name}; el archivo puede estar corrupto.`);
    }

    entries.push({
      name,
      content: decompressed,
    });

    pointer += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}
