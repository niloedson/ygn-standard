/**
 * Reference Converter: Dueling Book Raw Clickstream -> YGN v1.1
 * Part of YGN-Standard RFC 0001
 */
export interface DuelingBookConversionResult {
    headers: Record<string, string>;
    ygnText: string;
    originalLinesCount: number;
    ygnLinesCount: number;
    originalByteSize: number;
    ygnByteSize: number;
    compressionPercent: number;
    actionsDetected: number;
}
export declare function convertDuelingBookToYgn(rawLogText: string): DuelingBookConversionResult;
