/**
 * Statistical analysis using twokeys for exploratory data analysis
 */

import { StatisticalContext } from '../common-types';

// Twokeys types (compatible with v1.0.0)
interface TwokeysSeries {
  data: number[];
  sorted(): number[];
  mean(): number;
  median(): { datum: number; depth: number };
  hinges(): { lowerHinge: number; upperHinge: number };
  stemAndLeaf(): string;
  letterValues(): Record<string, number>;
}

export class StatisticalAnalyzer {
  /**
   * Create a twokeys-compatible series
   */
  private static createSeries(data: number[]): TwokeysSeries {
    return {
      data: data.filter((d) => typeof d === 'number' && !isNaN(d)),
      sorted(): number[] {
        return [...this.data].sort((a, b) => a - b);
      },
      mean(): number {
        const validData = this.data;
        if (validData.length === 0) return 0;
        return validData.reduce((sum, val) => sum + val, 0) / validData.length;
      },
      median(): { datum: number; depth: number } {
        const sorted = this.sorted();
        const n = sorted.length;
        if (n === 0) return { datum: 0, depth: 0 };
        const depth = (n + 1) / 2;
        if (n % 2 === 1) {
          return { datum: sorted[Math.floor(n / 2)], depth };
        } else {
          const mid = n / 2;
          return { datum: (sorted[mid - 1] + sorted[mid]) / 2, depth };
        }
      },
      hinges(): { lowerHinge: number; upperHinge: number } {
        const sorted = this.sorted();
        const n = sorted.length;
        if (n < 3) return { lowerHinge: sorted[0], upperHinge: sorted[n - 1] };

        const lower = Math.floor((n + 1) / 4);
        const upper = Math.floor((3 * n + 3) / 4);
        return {
          lowerHinge: sorted[lower],
          upperHinge: sorted[upper],
        };
      },
      stemAndLeaf(): string {
        const sorted = this.sorted();
        if (sorted.length === 0) return 'No data';

        const stems = new Map<string, string[]>();
        sorted.forEach((val) => {
          const stem = Math.floor(val / 10).toString();
          const leaf = Math.abs(val % 10).toString();
          if (!stems.has(stem)) {
            stems.set(stem, []);
          }
          stems.get(stem)!.push(leaf);
        });

        let result = '';
        const sortedStems = Array.from(stems.keys()).sort();
        sortedStems.forEach((stem) => {
          result += stem + ' | ' + stems.get(stem)!.sort().join(' ') + '\n';
        });

        return result;
      },
      letterValues(): Record<string, number> {
        const sorted = this.sorted();
        const n = sorted.length;
        if (n === 0) return {};

        const letterValues: Record<string, number> = {};
        const depths = [
          'M',
          'H',
          'E',
          'D',
          'C',
          'B',
          'A',
          'Z',
          'Y',
          'X',
          'W',
          'V',
          'U',
          'T',
          'S',
          'R',
          'Q',
          'P',
          'O',
          'N',
          'L',
          'K',
          'J',
          'G',
          'F',
          'I',
        ];

        for (let i = 0; i < Math.min(depths.length, n); i++) {
          const depth = Math.floor(((i + 1) * (n + 1)) / (depths.length + 1));
          const index = Math.ceil(depth) - 1;
          if (index < n) {
            letterValues[depths[i]] = sorted[index];
          }
        }

        return letterValues;
      },
    };
  }

  /**
   * Analyze numerical data using Tukey's exploratory methods
   */
  static analyzeNumericalData(
    data: number[]
  ): StatisticalContext['distribution'] {
    if (data.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
      };
    }

    const series = this.createSeries(data);
    const sorted = series.sorted();
    const n = sorted.length;

    // Basic statistics
    const mean = series.mean();
    const medianResult = series.median();
    const median = medianResult.datum;

    // Quartiles and IQR
    const hinges = series.hinges();
    const iqr = hinges.upperHinge - hinges.lowerHinge;

    // Standard deviation
    const variance =
      data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[n - 1],
      q1: hinges.lowerHinge,
      q3: hinges.upperHinge,
      iqr,
    };
  }

  /**
   * Detect outliers using Tukey fences
   */
  static detectOutliers(data: number[]): number[] {
    if (data.length < 4) return [];

    const series = this.createSeries(data);
    const hinges = series.hinges();
    const iqr = hinges.upperHinge - hinges.lowerHinge;

    // Tukey fences
    const lowerFence = hinges.lowerHinge - 1.5 * iqr;
    const upperFence = hinges.upperHinge + 1.5 * iqr;

    return data.filter((val) => val < lowerFence || val > upperFence);
  }

  /**
   * Analyze data quality metrics
   */
  static analyzeDataQuality(data: any[]): StatisticalContext['dataQuality'] {
    const totalFields = data.length > 0 ? Object.keys(data[0] || {}).length : 0;
    let completeRecords = 0;
    const consistentFields = new Set<string>();

    data.forEach((record) => {
      if (typeof record === 'object' && record !== null) {
        const fields = Object.keys(record);
        const completeFields = fields.filter(
          (field) =>
            record[field] !== null &&
            record[field] !== undefined &&
            record[field] !== ''
        );

        if (completeFields.length === totalFields) {
          completeRecords++;
        }

        fields.forEach((field) => consistentFields.add(field));
      }
    });

    const completeness = totalFields > 0 ? completeRecords / data.length : 0;
    const consistency =
      totalFields > 0 ? consistentFields.size / totalFields : 0;
    const outliers = this.detectOutliers(
      data
        .filter((record) => typeof record === 'number')
        .map((record) => record as number)
    ).length;

    return {
      completeness,
      consistency,
      outliers,
    };
  }

  /**
   * Generate comprehensive statistical context
   */
  static generateStatisticalContext(data: any[]): StatisticalContext {
    // Extract numerical data for analysis
    const numericalData = data
      .filter((item) => typeof item === 'number')
      .map((item) => item as number);

    // Extract numerical fields from objects
    const objectData = data.filter(
      (item) => typeof item === 'object' && item !== null
    );
    const allNumericalValues: number[] = [];

    objectData.forEach((obj) => {
      Object.values(obj).forEach((value) => {
        if (typeof value === 'number' && !isNaN(value)) {
          allNumericalValues.push(value);
        }
      });
    });

    const distribution = this.analyzeNumericalData(allNumericalValues);
    const outliers = this.detectOutliers(allNumericalValues);
    const dataQuality = this.analyzeDataQuality(data);

    // Detect patterns
    const patterns = this.detectPatterns(data);

    return {
      outliers,
      distribution,
      patterns,
      dataQuality,
    };
  }

  /**
   * Detect data patterns and characteristics
   */
  static detectPatterns(data: any[]): string[] {
    const patterns: string[] = [];

    if (data.length === 0) return patterns;

    // Check for temporal patterns
    const dateFields = new Set<string>();
    const numericFields = new Set<string>();
    const textFields = new Set<string>();

    data.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        Object.entries(item).forEach(([key, value]) => {
          if (
            value instanceof Date ||
            (typeof value === 'string' && !isNaN(Date.parse(value)))
          ) {
            dateFields.add(key);
          } else if (typeof value === 'number') {
            numericFields.add(key);
          } else if (typeof value === 'string') {
            textFields.add(key);
          }
        });
      }
    });

    if (dateFields.size > 0) {
      patterns.push(
        `Temporal data detected in fields: ${Array.from(dateFields).join(', ')}`
      );
    }

    if (numericFields.size > 0) {
      patterns.push(
        `Numerical data in fields: ${Array.from(numericFields).join(', ')}`
      );
    }

    if (textFields.size > 0) {
      patterns.push(
        `Text data in fields: ${Array.from(textFields).join(', ')}`
      );
    }

    // Check for ID patterns
    const idPatterns = ['id', 'uuid', 'key', 'identifier'];
    const hasIdField = data.some(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        Object.keys(item).some((key) =>
          idPatterns.some((pattern) => key.toLowerCase().includes(pattern))
        )
    );

    if (hasIdField) {
      patterns.push('ID/identifier fields detected');
    }

    return patterns;
  }

  /**
   * Generate stem-and-leaf display for numerical data
   */
  static generateStemAndLeaf(data: number[]): string {
    if (data.length === 0) return 'No data';

    const series = this.createSeries(data);
    return series.stemAndLeaf();
  }

  /**
   * Generate letter values (extended quartiles)
   */
  static generateLetterValues(data: number[]): Record<string, number> {
    if (data.length === 0) return {};

    const series = this.createSeries(data);
    return series.letterValues();
  }
}
