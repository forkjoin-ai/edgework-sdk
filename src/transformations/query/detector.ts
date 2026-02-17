/**
 * Intelligent input type detection for bidirectional query command
 */

import { InputDetection, InputType } from '../common-types';

export class InputDetector {
  /**
   * Detect input type and suggest transformation mode
   */
  static detectInputType(input: string): InputDetection {
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return {
        type: 'text',
        confidence: 0.5,
        suggestedMode: 'text2sql',
      };
    }

    // Check for JSON/structured data
    const jsonDetection = this.detectJson(trimmed);
    if (jsonDetection.isJson) {
      return {
        type: 'json',
        confidence: jsonDetection.confidence,
        suggestedMode: 'sql2text',
      };
    }

    // Check for SQL queries
    const sqlDetection = this.detectSql(trimmed);
    if (sqlDetection.isSql) {
      return {
        type: 'sql',
        confidence: sqlDetection.confidence,
        suggestedMode: 'sql2text',
      };
    }

    // Check for CSV data
    const csvDetection = this.detectCsv(trimmed);
    if (csvDetection.isCsv) {
      return {
        type: 'csv',
        confidence: csvDetection.confidence,
        suggestedMode: 'text2sql',
      };
    }

    // Default to text
    return {
      type: 'text',
      confidence: 0.8,
      suggestedMode: 'text2sql',
    };
  }

  /**
   * Detect JSON input
   */
  private static detectJson(input: string): {
    isJson: boolean;
    confidence: number;
  } {
    try {
      const parsed = JSON.parse(input);

      // Check if it looks like query results
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          return { isJson: true, confidence: 0.95 };
        }
      }

      // Check if it's a single object
      if (typeof parsed === 'object' && parsed !== null) {
        return { isJson: true, confidence: 0.9 };
      }

      return { isJson: true, confidence: 0.7 };
    } catch {
      return { isJson: false, confidence: 0 };
    }
  }

  /**
   * Detect SQL input
   */
  private static detectSql(input: string): {
    isSql: boolean;
    confidence: number;
  } {
    const upperInput = input.toUpperCase().trim();

    // Common SQL keywords
    const sqlKeywords = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'FROM',
      'WHERE',
      'JOIN',
      'INNER',
      'LEFT',
      'RIGHT',
      'GROUP BY',
      'ORDER BY',
      'HAVING',
      'UNION',
      'WITH',
      'AS',
      'ON',
    ];

    // Check for SELECT statements (most common)
    if (upperInput.startsWith('SELECT')) {
      const hasFrom = upperInput.includes('FROM');
      const hasSemicolon = input.trim().endsWith(';');
      let confidence = 0.8;

      if (hasFrom) confidence += 0.1;
      if (hasSemicolon) confidence += 0.1;

      return { isSql: true, confidence: Math.min(confidence, 1.0) };
    }

    // Check for other SQL statements
    for (const keyword of sqlKeywords) {
      if (upperInput.includes(keyword)) {
        return { isSql: true, confidence: 0.7 };
      }
    }

    // Check for SQL-like patterns
    const sqlPatterns = [
      /^\s*SELECT\s+/i,
      /^\s*INSERT\s+/i,
      /^\s*UPDATE\s+/i,
      /^\s*DELETE\s+/i,
      /^\s*CREATE\s+/i,
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(input)) {
        return { isSql: true, confidence: 0.6 };
      }
    }

    return { isSql: false, confidence: 0 };
  }

  /**
   * Detect CSV input
   */
  private static detectCsv(input: string): {
    isCsv: boolean;
    confidence: number;
  } {
    const lines = input.split('\n').filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return { isCsv: false, confidence: 0 };
    }

    // Check for comma-separated values
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;

    // Must have at least one comma and multiple lines
    if (commaCount === 0) {
      return { isCsv: false, confidence: 0 };
    }

    // Check if all lines have similar comma counts
    let consistentCommas = true;
    const expectedCommas = commaCount;

    for (let i = 1; i < Math.min(lines.length, 5); i++) {
      const lineCommas = (lines[i].match(/,/g) || []).length;
      if (Math.abs(lineCommas - expectedCommas) > 2) {
        consistentCommas = false;
        break;
      }
    }

    let confidence = 0.6;
    if (consistentCommas) confidence += 0.2;
    if (lines.length > 5) confidence += 0.1;
    if (firstLine.includes(',')) confidence += 0.1;

    return { isCsv: true, confidence: Math.min(confidence, 1.0) };
  }

  /**
   * Detect if input is likely dash query output
   */
  static detectDashQueryOutput(input: string): boolean {
    try {
      const parsed = JSON.parse(input);

      // Dash query output typically has specific structure
      if (Array.isArray(parsed) && parsed.length > 0) {
        const firstItem = parsed[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          // Check for common dash fields
          const dashFields = [
            'id',
            'created_at',
            'updated_at',
            'data',
            'metadata',
          ];
          const hasDashFields = Object.keys(firstItem).some((key) =>
            dashFields.includes(key.toLowerCase())
          );
          return hasDashFields;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Get transformation mode based on detection and user preference
   */
  static getTransformationMode(
    detection: InputDetection,
    userMode?: 'text2sql' | 'sql2text' | 'auto'
  ): 'text2sql' | 'sql2text' {
    if (userMode && userMode !== 'auto') {
      return userMode;
    }

    return detection.suggestedMode;
  }

  /**
   * Analyze input characteristics for better processing
   */
  static analyzeInputCharacteristics(input: string): {
    length: number;
    lines: number;
    hasNumbers: boolean;
    hasDates: boolean;
    hasEmails: boolean;
    hasUrls: boolean;
    estimatedRecords: number;
  } {
    const lines = input.split('\n').filter((line) => line.trim().length > 0);

    return {
      length: input.length,
      lines: lines.length,
      hasNumbers: /\d/.test(input),
      hasDates: /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(input),
      hasEmails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(
        input
      ),
      hasUrls: /https?:\/\/[^\s]+/.test(input),
      estimatedRecords: this.estimateRecordCount(input),
    };
  }

  /**
   * Estimate number of records in input
   */
  private static estimateRecordCount(input: string): number {
    // For JSON arrays
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
    } catch {
      // JSON parsing failed, continue to other detection methods
    }

    // For CSV
    const lines = input.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length > 1) {
      return lines.length - 1; // Subtract header row
    }

    // For structured text (estimate by line breaks)
    return lines.length;
  }
}
