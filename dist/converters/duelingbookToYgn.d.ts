/**
 * @file duelingbookToYgn.ts
 * @description Reference converter transforming raw Dueling Book plain-text match clickstreams
 * into standardized, compact RFC 0001 Algebraic Yu-Gi-Oh! Game Notation (YGN v1.1) and YBN snapshots.
 */
export declare function normalizeZone(zoneStr: string): string;
export declare function cleanCardName(rawName: string): string;
export interface DuelingBookConversionResult {
    headers: Record<string, string>;
    ygnText: string;
    originalLinesCount: number;
    ygnLinesCount: number;
    originalByteSize: number;
    ygnByteSize: number;
    noisePercent: string;
    compressionPercent: string;
    latencyMs: string;
    actionsDetected: number;
}
export declare function convertDuelingBookToYgn(rawLogText: string): DuelingBookConversionResult;
