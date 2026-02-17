/**
 * Build statistical context for AI prompts
 */

import { StatisticalContext } from '../common-types';
import { StatisticalAnalyzer } from './analyzer';

export class ContextBuilder {
  /**
   * Build context for text-to-SQL transformation
   */
  static buildTextToSQLContext(
    data: any[],
    statisticalContext: StatisticalContext
  ): string {
    const context = [];

    context.push('## Statistical Analysis Context');
    context.push('');

    // Data quality assessment
    context.push('### Data Quality');
    context.push(
      `- Completeness: ${(
        statisticalContext.dataQuality.completeness * 100
      ).toFixed(1)}%`
    );
    context.push(
      `- Consistency: ${(
        statisticalContext.dataQuality.consistency * 100
      ).toFixed(1)}%`
    );
    context.push(
      `- Outliers detected: ${statisticalContext.dataQuality.outliers}`
    );
    context.push('');

    // Distribution analysis for numerical data
    if (
      statisticalContext.distribution.mean !== 0 ||
      statisticalContext.distribution.median !== 0
    ) {
      context.push('### Numerical Distribution');
      context.push(
        `- Mean: ${statisticalContext.distribution.mean.toFixed(2)}`
      );
      context.push(
        `- Median: ${statisticalContext.distribution.median.toFixed(2)}`
      );
      context.push(
        `- Standard Deviation: ${statisticalContext.distribution.stdDev.toFixed(
          2
        )}`
      );
      context.push(
        `- Range: ${statisticalContext.distribution.min.toFixed(
          2
        )} - ${statisticalContext.distribution.max.toFixed(2)}`
      );
      context.push(
        `- Interquartile Range: ${statisticalContext.distribution.iqr.toFixed(
          2
        )}`
      );
      context.push('');
    }

    // Detected patterns
    if (statisticalContext.patterns.length > 0) {
      context.push('### Detected Patterns');
      statisticalContext.patterns.forEach((pattern) => {
        context.push(`- ${pattern}`);
      });
      context.push('');
    }

    // Outlier analysis
    if (statisticalContext.outliers.length > 0) {
      context.push('### Outlier Analysis');
      context.push(`- ${statisticalContext.outliers.length} outliers detected`);
      context.push(
        `- Outlier values: [${statisticalContext.outliers
          .slice(0, 10)
          .join(', ')}${statisticalContext.outliers.length > 10 ? '...' : ''}]`
      );
      context.push('');
    }

    // Data type recommendations
    context.push('### Recommended Data Types');
    const typeRecommendations = this.generateTypeRecommendations(
      data,
      statisticalContext
    );
    Object.entries(typeRecommendations).forEach(([field, type]) => {
      context.push(`- ${field}: ${type}`);
    });
    context.push('');

    return context.join('\n');
  }

  /**
   * Build context for SQL-to-text transformation
   */
  static buildSQLToTextContext(
    data: any[],
    statisticalContext: StatisticalContext
  ): string {
    const context = [];

    context.push('## Data Summary Context');
    context.push('');

    // Overview
    context.push('### Dataset Overview');
    context.push(`- Total records: ${data.length}`);
    context.push(
      `- Fields analyzed: ${
        data.length > 0 ? Object.keys(data[0] || {}).length : 0
      }`
    );
    context.push('');

    // Statistical summary
    if (
      statisticalContext.distribution.mean !== 0 ||
      statisticalContext.distribution.median !== 0
    ) {
      context.push('### Statistical Summary');
      context.push(
        `- Average: ${statisticalContext.distribution.mean.toFixed(2)}`
      );
      context.push(
        `- Median: ${statisticalContext.distribution.median.toFixed(2)}`
      );
      context.push(
        `- Spread: ${statisticalContext.distribution.stdDev.toFixed(
          2
        )} (standard deviation)`
      );
      context.push(
        `- Range: ${statisticalContext.distribution.min.toFixed(
          2
        )} to ${statisticalContext.distribution.max.toFixed(2)}`
      );
      context.push('');
    }

    // Data quality insights
    context.push('### Data Quality Insights');
    if (statisticalContext.dataQuality.completeness < 0.9) {
      context.push('- WARNING: Data completeness concerns detected');
    }
    if (statisticalContext.dataQuality.outliers > 0) {
      context.push(
        `- STATISTICS: ${statisticalContext.dataQuality.outliers} statistical outliers identified`
      );
    }
    if (
      statisticalContext.distribution.stdDev >
      statisticalContext.distribution.mean * 0.5
    ) {
      context.push('- VARIABILITY: High variability detected in the data');
    }
    context.push('');

    // Pattern insights
    if (statisticalContext.patterns.length > 0) {
      context.push('### Pattern Insights');
      statisticalContext.patterns.forEach((pattern) => {
        const insight = this.translatePatternToInsight(pattern);
        if (insight) {
          context.push(`- ${insight}`);
        }
      });
      context.push('');
    }

    return context.join('\n');
  }

  /**
   * Generate data type recommendations based on statistical analysis
   */
  private static generateTypeRecommendations(
    data: any[],
    statisticalContext: StatisticalContext
  ): Record<string, string> {
    const recommendations: Record<string, string> = {};

    if (data.length === 0) return recommendations;

    const sample = data[0];
    if (typeof sample !== 'object' || sample === null) return recommendations;

    Object.entries(sample).forEach(([field, value]) => {
      const fieldValues = data
        .map((item) => item[field])
        .filter((val) => val !== null && val !== undefined && val !== '');

      if (fieldValues.length === 0) {
        recommendations[field] = 'TEXT';
        return;
      }

      // Check if all values are numbers
      const allNumeric = fieldValues.every(
        (val) => typeof val === 'number' && !isNaN(val)
      );
      if (allNumeric) {
        const numValues = fieldValues as number[];
        const hasDecimals = numValues.some((val) => val % 1 !== 0);
        const range = Math.max(...numValues) - Math.min(...numValues);

        if (range > 2147483647) {
          recommendations[field] = 'REAL';
        } else if (hasDecimals) {
          recommendations[field] = 'REAL';
        } else {
          recommendations[field] = 'INTEGER';
        }
        return;
      }

      // Check if values look like dates
      const allDates = fieldValues.every(
        (val) => typeof val === 'string' && !isNaN(Date.parse(val))
      );
      if (allDates) {
        recommendations[field] = 'TEXT (timestamp)';
        return;
      }

      // Check if values look like IDs
      const allIds = fieldValues.every(
        (val) =>
          typeof val === 'string' &&
          (val.length < 50 || /^[a-f0-9-]{36}$/.test(val))
      );
      if (allIds && field.toLowerCase().includes('id')) {
        recommendations[field] = 'TEXT (primary key)';
        return;
      }

      // Check text length
      const avgLength =
        fieldValues.reduce((sum, val) => sum + String(val).length, 0) /
        fieldValues.length;

      if (avgLength > 1000) {
        recommendations[field] = 'TEXT (long)';
      } else {
        recommendations[field] = 'TEXT';
      }
    });

    return recommendations;
  }

  /**
   * Translate detected patterns into human insights
   */
  private static translatePatternToInsight(pattern: string): string | null {
    if (pattern.includes('Temporal data')) {
      return 'TIME-SERIES: Time-series data detected - consider temporal analysis';
    }
    if (pattern.includes('Numerical data')) {
      return 'QUANTITATIVE: Quantitative data available for statistical analysis';
    }
    if (pattern.includes('Text data')) {
      return 'TEXTUAL: Textual data present - natural language processing applicable';
    }
    if (pattern.includes('ID/identifier')) {
      return 'IDENTIFIER: Unique identifiers found - suitable for primary keys';
    }
    return null;
  }

  /**
   * Build comprehensive prompt with statistical context
   */
  static buildPrompt(
    basePrompt: string,
    data: any[],
    statisticalContext: StatisticalContext,
    mode: 'text2sql' | 'sql2text'
  ): string {
    const context =
      mode === 'text2sql'
        ? this.buildTextToSQLContext(data, statisticalContext)
        : this.buildSQLToTextContext(data, statisticalContext);

    return `${basePrompt}

${context}

---
*Statistical analysis powered by Twokeys exploratory data analysis*`;
  }
}
