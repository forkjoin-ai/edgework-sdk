/**
 * Generate comprehensive statistical reports with luxury export formats
 */

import { StatisticalContext, TextSummaryResult } from '../common-types';

export interface ReportConfig {
  format: 'text' | 'markdown' | 'json' | 'csv' | 'html' | 'latex' | 'pdf';
  template?: string;
  includeCharts?: boolean;
  includeRawData?: boolean;
  includeOutlierReport?: boolean;
  detailLevel: 'summary' | 'detailed' | 'comprehensive';
  customSections?: string[];
}

export class ReportGenerator {
  /**
   * Generate comprehensive statistical report
   */
  static generateReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    switch (config.format) {
      case 'markdown':
        return this.generateMarkdownReport(data, statisticalContext, config);
      case 'json':
        return this.generateJsonReport(data, statisticalContext, config);
      case 'csv':
        return this.generateCsvReport(data, statisticalContext, config);
      case 'html':
        return this.generateHtmlReport(data, statisticalContext, config);
      case 'latex':
        return this.generateLatexReport(data, statisticalContext, config);
      case 'pdf':
        return this.generatePdfReport(data, statisticalContext, config);
      default:
        return this.generateTextReport(data, statisticalContext, config);
    }
  }

  /**
   * Generate luxury markdown report
   */
  private static generateMarkdownReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    const report = [];

    // Header
    report.push('# Statistical Analysis Report');
    report.push('');
    report.push(`**Generated:** ${new Date().toISOString()}`);
    report.push(`**Records:** ${data.length}`);
    report.push(`**Analysis Depth:** ${config.detailLevel}`);
    report.push('');

    // Executive Summary
    report.push('## Executive Summary');
    report.push('');
    report.push(this.generateExecutiveSummary(data, statisticalContext));
    report.push('');

    // Data Quality Assessment
    report.push('## Data Quality Assessment');
    report.push('');
    report.push('| Metric | Score | Status |');
    report.push('|--------|-------|--------|');
    report.push(
      `| Completeness | ${(
        statisticalContext.dataQuality.completeness * 100
      ).toFixed(1)}% | ${this.getQualityStatus(
        statisticalContext.dataQuality.completeness
      )} |`
    );
    report.push(
      `| Consistency | ${(
        statisticalContext.dataQuality.consistency * 100
      ).toFixed(1)}% | ${this.getQualityStatus(
        statisticalContext.dataQuality.consistency
      )} |`
    );
    report.push(
      `| Outliers | ${statisticalContext.dataQuality.outliers} | ${
        statisticalContext.dataQuality.outliers > 0
          ? '[!] Requires Attention'
          : '[OK] Clean'
      } |`
    );
    report.push('');

    // Statistical Overview
    if (
      statisticalContext.distribution.mean !== 0 ||
      statisticalContext.distribution.median !== 0
    ) {
      report.push('## Statistical Overview');
      report.push('');
      report.push('### Central Tendency');
      report.push('');
      report.push('| Statistic | Value | Interpretation |');
      report.push('|----------|-------|--------------|');
      report.push(
        `| Mean | ${statisticalContext.distribution.mean.toFixed(
          2
        )} | Average value |`
      );
      report.push(
        `| Median | ${statisticalContext.distribution.median.toFixed(
          2
        )} | Middle value (50th percentile) |`
      );
      report.push(
        `| Mode | ${this.calculateMode(data)} | Most frequent value |`
      );
      report.push('');

      report.push('### Dispersion');
      report.push('');
      report.push('| Statistic | Value | Interpretation |');
      report.push('|----------|-------|--------------|');
      report.push(
        `| Range | ${statisticalContext.distribution.min.toFixed(
          2
        )} - ${statisticalContext.distribution.max.toFixed(2)} | Data spread |`
      );
      report.push(
        `| Std Dev | ${statisticalContext.distribution.stdDev.toFixed(
          2
        )} | Typical deviation from mean |`
      );
      report.push(
        `| IQR | ${statisticalContext.distribution.iqr.toFixed(
          2
        )} | Middle 50% spread |`
      );
      report.push('');

      // Box plot data
      if (config.detailLevel === 'comprehensive') {
        report.push('### Five-Number Summary');
        report.push('');
        report.push(
          '```\nMin:    ' + statisticalContext.distribution.min.toFixed(2)
        );
        report.push('Q1:     ' + statisticalContext.distribution.q1.toFixed(2));
        report.push(
          'Median: ' + statisticalContext.distribution.median.toFixed(2)
        );
        report.push('Q3:     ' + statisticalContext.distribution.q3.toFixed(2));
        report.push(
          'Max:    ' + statisticalContext.distribution.max.toFixed(2)
        );
        report.push('```');
        report.push('');
      }
    }

    // Pattern Analysis
    if (statisticalContext.patterns.length > 0) {
      report.push('## Pattern Analysis');
      report.push('');
      statisticalContext.patterns.forEach((pattern) => {
        report.push(`- **${pattern}**`);
      });
      report.push('');
    }

    // Outlier Analysis
    if (statisticalContext.outliers.length > 0 && config.includeOutlierReport) {
      report.push('## Outlier Analysis');
      report.push('');
      report.push(
        `**${statisticalContext.outliers.length} outliers detected**`
      );
      report.push('');
      report.push('| Outlier | Z-Score | Potential Impact |');
      report.push('|---------|--------|-----------------|');

      statisticalContext.outliers.slice(0, 20).forEach((outlier) => {
        const zScore = this.calculateZScore(
          outlier,
          statisticalContext.distribution
        );
        const impact =
          Math.abs(zScore) > 3
            ? 'High'
            : Math.abs(zScore) > 2
            ? 'Medium'
            : 'Low';
        report.push(
          `| ${outlier.toFixed(2)} | ${zScore.toFixed(2)} | ${impact} |`
        );
      });

      if (statisticalContext.outliers.length > 20) {
        report.push(
          `| ... | ... | ... | (${
            statisticalContext.outliers.length - 20
          } more) |`
        );
      }
      report.push('');
    }

    // Recommendations
    report.push('## Recommendations');
    report.push('');
    report.push(this.generateRecommendations(data, statisticalContext));
    report.push('');

    // Technical Details
    if (config.detailLevel === 'comprehensive') {
      report.push('## Technical Details');
      report.push('');
      report.push('### Analysis Methodology');
      report.push('- **Statistical Engine:** Two.js (Tukey EDA methods)');
      report.push('- **Outlier Detection:** Tukey fences (1.5 × IQR)');
      report.push(
        '- **Distribution Analysis:** Classical descriptive statistics'
      );
      report.push('- **Pattern Recognition:** Heuristic field analysis');
      report.push('');

      report.push('### Data Processing Pipeline');
      report.push('1. **Input Validation:** Type checking and sanitization');
      report.push(
        '2. **Statistical Analysis:** Distribution and outlier detection'
      );
      report.push(
        '3. **Pattern Recognition:** Field type and relationship analysis'
      );
      report.push(
        '4. **Quality Assessment:** Completeness and consistency metrics'
      );
      report.push('5. **Report Generation:** Template-based output formatting');
      report.push('');
    }

    // Footer
    report.push('---');
    report.push(
      '*Report generated by Edgework SDK with Twokeys statistical analysis*'
    );
    report.push(`*Analysis completed in ${new Date().toISOString()}*`);

    return report.join('\n');
  }

  /**
   * Generate JSON report
   */
  private static generateJsonReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    const report = {
      metadata: {
        generated: new Date().toISOString(),
        recordCount: data.length,
        analysisDepth: config.detailLevel,
        engine: 'Edgework SDK with Twokeys',
      },
      summary: this.generateExecutiveSummary(data, statisticalContext),
      dataQuality: statisticalContext.dataQuality,
      statistics: statisticalContext.distribution,
      patterns: statisticalContext.patterns,
      outliers: statisticalContext.outliers,
      recommendations: this.generateRecommendations(data, statisticalContext),
      rawData: config.includeRawData ? data : undefined,
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate CSV report
   */
  private static generateCsvReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    const csv = [];

    // Header
    csv.push('Metric,Value,Interpretation');

    // Basic stats
    csv.push(`Record Count,${data.length},Total records analyzed`);
    csv.push(`Mean,${statisticalContext.distribution.mean},Average value`);
    csv.push(`Median,${statisticalContext.distribution.median},Middle value`);
    csv.push(
      `Std Dev,${statisticalContext.distribution.stdDev},Typical deviation`
    );
    csv.push(`Min,${statisticalContext.distribution.min},Minimum value`);
    csv.push(`Max,${statisticalContext.distribution.max},Maximum value`);
    csv.push(`Q1,${statisticalContext.distribution.q1},25th percentile`);
    csv.push(`Q3,${statisticalContext.distribution.q3},75th percentile`);
    csv.push(`IQR,${statisticalContext.distribution.iqr},Interquartile range`);

    // Quality metrics
    csv.push(
      `Completeness,${statisticalContext.dataQuality.completeness},Data completeness ratio`
    );
    csv.push(
      `Consistency,${statisticalContext.dataQuality.consistency},Field consistency ratio`
    );
    csv.push(
      `Outliers,${statisticalContext.outliers.length},Number of outliers`
    );

    return csv.join('\n');
  }

  /**
   * Generate HTML report
   */
  private static generateHtmlReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Statistical Analysis Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .quality-good { border-left-color: #28a745; }
        .quality-warning { border-left-color: #ffc107; }
        .quality-danger { border-left-color: #dc3545; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .outlier { background-color: #fff3cd; }
        .recommendation { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Statistical Analysis Report</h1>
        <p>Generated: ${new Date().toISOString()} | Records: ${data.length}</p>
    </div>

    <div class="metric-card">
        <h2>Executive Summary</h2>
        <p>${this.generateExecutiveSummary(data, statisticalContext)}</p>
    </div>

    <div class="metric-card ${this.getQualityClass(
      statisticalContext.dataQuality.completeness
    )}">
        <h2>Data Quality Assessment</h2>
        <table>
            <tr><th>Metric</th><th>Score</th><th>Status</th></tr>
            <tr><td>Completeness</td><td>${(
              statisticalContext.dataQuality.completeness * 100
            ).toFixed(1)}%</td><td>${this.getQualityStatus(
      statisticalContext.dataQuality.completeness
    )}</td></tr>
            <tr><td>Consistency</td><td>${(
              statisticalContext.dataQuality.consistency * 100
            ).toFixed(1)}%</td><td>${this.getQualityStatus(
      statisticalContext.dataQuality.consistency
    )}</td></tr>
            <tr><td>Outliers</td><td>${
              statisticalContext.dataQuality.outliers
            }</td><td>${
      statisticalContext.dataQuality.outliers > 0
        ? '[!] Requires Attention'
        : '[OK] Clean'
    }</td></tr>
        </table>
    </div>

    ${
      statisticalContext.distribution.mean !== 0 ||
      statisticalContext.distribution.median !== 0
        ? `
    <div class="metric-card">
        <h2>Statistical Overview</h2>
        <table>
            <tr><th>Statistic</th><th>Value</th><th>Interpretation</th></tr>
            <tr><td>Mean</td><td>${statisticalContext.distribution.mean.toFixed(
              2
            )}</td><td>Average value</td></tr>
            <tr><td>Median</td><td>${statisticalContext.distribution.median.toFixed(
              2
            )}</td><td>Middle value</td></tr>
            <tr><td>Std Dev</td><td>${statisticalContext.distribution.stdDev.toFixed(
              2
            )}</td><td>Typical deviation</td></tr>
            <tr><td>Range</td><td>${statisticalContext.distribution.min.toFixed(
              2
            )} - ${statisticalContext.distribution.max.toFixed(
            2
          )}</td><td>Data spread</td></tr>
        </table>
    </div>
    `
        : ''
    }

    <div class="recommendation">
        <h2>Recommendations</h2>
        <p>${this.generateRecommendations(data, statisticalContext)}</p>
    </div>

    <footer>
        <hr>
        <p><em>Report generated by Edgework SDK with Twokeys statistical analysis</em></p>
    </footer>
</body>
</html>`;

    return html;
  }

  /**
   * Generate LaTeX report
   */
  private static generateLatexReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    return `
\\documentclass{article}
\\usepackage{geometry}
\\usepackage{booktabs}
\\usepackage{graphicx}
\\geometry{a4paper, margin=1in}

\\title{Statistical Analysis Report}
\\author{Edgework SDK with Twokeys}
\\date{${new Date().toISOString()}}

\\begin{document}
\\maketitle

\\section{Executive Summary}
${this.generateExecutiveSummary(data, statisticalContext)}

\\section{Data Quality Assessment}
\\begin{table}[h]
\\centering
\\begin{tabular}{lcc}
\\toprule
Metric & Score & Status \\\\
\\midrule
Completeness & ${(statisticalContext.dataQuality.completeness * 100).toFixed(
      1
    )}\\% & ${this.getQualityStatus(
      statisticalContext.dataQuality.completeness
    )} \\\\
Consistency & ${(statisticalContext.dataQuality.consistency * 100).toFixed(
      1
    )}\\% & ${this.getQualityStatus(
      statisticalContext.dataQuality.consistency
    )} \\\\
Outliers & ${statisticalContext.dataQuality.outliers} & ${
      statisticalContext.dataQuality.outliers > 0 ? 'Warning' : 'Clean'
    } \\\\
\\bottomrule
\\end{tabular}
\\end{table}

${
  statisticalContext.distribution.mean !== 0 ||
  statisticalContext.distribution.median !== 0
    ? `
\\section{Statistical Overview}
\\subsection{Central Tendency}
\\begin{table}[h]
\\centering
\\begin{tabular}{lc}
\\toprule
Statistic & Value \\\\
\\midrule
Mean & ${statisticalContext.distribution.mean.toFixed(2)} \\\\
Median & ${statisticalContext.distribution.median.toFixed(2)} \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\subsection{Dispersion}
\\begin{table}[h]
\\centering
\\begin{tabular}{lc}
\\toprule
Statistic & Value \\\\
\\midrule
Range & ${statisticalContext.distribution.min.toFixed(
        2
      )} - ${statisticalContext.distribution.max.toFixed(2)} \\\\
Std Dev & ${statisticalContext.distribution.stdDev.toFixed(2)} \\\\
IQR & ${statisticalContext.distribution.iqr.toFixed(2)} \\\\
\\bottomrule
\\end{tabular}
\\end{table}
`
    : ''
}

\\section{Recommendations}
${this.generateRecommendations(data, statisticalContext)}

\\end{document}
`;
  }

  /**
   * Generate PDF report (placeholder - would need PDF library)
   */
  private static generatePdfReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    // For now, return markdown with PDF formatting note
    const markdown = this.generateMarkdownReport(
      data,
      statisticalContext,
      config
    );
    return `% PDF Export\n\n${markdown}\n\n% Note: Actual PDF generation would require a PDF library like jsPDF`;
  }

  /**
   * Generate text report
   */
  private static generateTextReport(
    data: any[],
    statisticalContext: StatisticalContext,
    config: ReportConfig
  ): string {
    const report = [];

    report.push('STATISTICAL ANALYSIS REPORT');
    report.push('='.repeat(50));
    report.push('');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Records: ${data.length}`);
    report.push(`Analysis Depth: ${config.detailLevel}`);
    report.push('');

    report.push('EXECUTIVE SUMMARY');
    report.push('-'.repeat(30));
    report.push(this.generateExecutiveSummary(data, statisticalContext));
    report.push('');

    report.push('DATA QUALITY ASSESSMENT');
    report.push('-'.repeat(30));
    report.push(
      `Completeness: ${(
        statisticalContext.dataQuality.completeness * 100
      ).toFixed(1)}% (${this.getQualityStatus(
        statisticalContext.dataQuality.completeness
      )})`
    );
    report.push(
      `Consistency: ${(
        statisticalContext.dataQuality.consistency * 100
      ).toFixed(1)}% (${this.getQualityStatus(
        statisticalContext.dataQuality.consistency
      )})`
    );
    report.push(
      `Outliers: ${statisticalContext.dataQuality.outliers} (${
        statisticalContext.dataQuality.outliers > 0
          ? 'Requires attention'
          : 'Clean'
      })`
    );
    report.push('');

    if (
      statisticalContext.distribution.mean !== 0 ||
      statisticalContext.distribution.median !== 0
    ) {
      report.push('STATISTICAL OVERVIEW');
      report.push('-'.repeat(30));
      report.push(`Mean: ${statisticalContext.distribution.mean.toFixed(2)}`);
      report.push(
        `Median: ${statisticalContext.distribution.median.toFixed(2)}`
      );
      report.push(
        `Std Dev: ${statisticalContext.distribution.stdDev.toFixed(2)}`
      );
      report.push(
        `Range: ${statisticalContext.distribution.min.toFixed(
          2
        )} - ${statisticalContext.distribution.max.toFixed(2)}`
      );
      report.push('');
    }

    report.push('RECOMMENDATIONS');
    report.push('-'.repeat(30));
    report.push(this.generateRecommendations(data, statisticalContext));
    report.push('');

    report.push('---');
    report.push(
      'Report generated by Edgework SDK with Twokeys statistical analysis'
    );

    return report.join('\n');
  }

  /**
   * Generate executive summary
   */
  private static generateExecutiveSummary(
    data: any[],
    statisticalContext: StatisticalContext
  ): string {
    const insights = [];

    if (data.length === 0) {
      return 'No data available for analysis.';
    }

    insights.push(
      `Analyzed ${data.length} records with ${
        statisticalContext.dataQuality.completeness * 100
      }% completeness.`
    );

    if (statisticalContext.dataQuality.outliers > 0) {
      insights.push(
        `Identified ${statisticalContext.dataQuality.outliers} statistical outliers requiring attention.`
      );
    }

    if (
      statisticalContext.distribution.stdDev >
      statisticalContext.distribution.mean * 0.5
    ) {
      insights.push(
        'High data variability detected - consider segmentation analysis.'
      );
    }

    if (statisticalContext.patterns.length > 0) {
      insights.push(
        `Key patterns: ${statisticalContext.patterns.slice(0, 3).join(', ')}.`
      );
    }

    return insights.join(' ');
  }

  /**
   * Generate recommendations
   */
  private static generateRecommendations(
    data: any[],
    statisticalContext: StatisticalContext
  ): string {
    const recommendations = [];

    if (statisticalContext.dataQuality.completeness < 0.9) {
      recommendations.push(
        '• Improve data completeness through better collection processes'
      );
    }

    if (statisticalContext.dataQuality.outliers > data.length * 0.1) {
      recommendations.push(
        '• High outlier ratio - investigate data collection methods'
      );
    }

    if (
      statisticalContext.distribution.stdDev >
      statisticalContext.distribution.mean
    ) {
      recommendations.push(
        '• Consider data transformation or segmentation for analysis'
      );
    }

    if (statisticalContext.patterns.some((p) => p.includes('Temporal'))) {
      recommendations.push(
        '• Implement time-series analysis for temporal patterns'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '• Data quality is good - proceed with standard analysis'
      );
    }

    return recommendations.join('\n');
  }

  /**
   * Get quality status
   */
  private static getQualityStatus(score: number): string {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.8) return 'Good';
    if (score >= 0.7) return 'Fair';
    return 'Poor';
  }

  /**
   * Get quality class for CSS
   */
  private static getQualityClass(score: number): string {
    if (score >= 0.9) return 'quality-good';
    if (score >= 0.7) return 'quality-warning';
    return 'quality-danger';
  }

  /**
   * Calculate mode
   */
  private static calculateMode(data: any[]): any {
    if (data.length === 0) return null;

    const frequency: Record<string, number> = {};
    data.forEach((item) => {
      const key = String(item);
      frequency[key] = (frequency[key] || 0) + 1;
    });

    let maxCount = 0;
    let mode = null;

    Object.entries(frequency).forEach(([value, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });

    return mode;
  }

  /**
   * Calculate Z-score
   */
  private static calculateZScore(
    value: number,
    distribution: StatisticalContext['distribution']
  ): number {
    if (distribution.stdDev === 0) return 0;
    return (value - distribution.mean) / distribution.stdDev;
  }
}
