# Data Analysis Template

## Overview
Comprehensive exploratory data analysis using statistical methods and pattern recognition.

## Analysis Framework
1. **Data Profiling**: Complete characterization of the dataset
2. **Descriptive Statistics**: Central tendency, dispersion, distribution
3. **Pattern Recognition**: Trends, cycles, anomalies, correlations
4. **Statistical Testing**: Significance testing where applicable
5. **Predictive Insights**: Forecasting based on identified patterns
6. **Visualization Suggestions**: Recommended charts and plots

## Statistical Methods
- **Tukey's Exploratory Data Analysis**: Using twokeys library
- **Outlier Detection**: Tukey fences (1.5 × IQR)
- **Distribution Analysis**: Normality, skewness, kurtosis
- **Correlation Analysis**: Variable relationships
- **Time Series Analysis**: If temporal data present

## Advanced Analysis
- **Segmentation Analysis**: Group patterns and subgroups
- **Clustering**: Natural groupings in data
- **Anomaly Detection**: Statistical outliers and unusual patterns
- **Quality Metrics**: Completeness, consistency, accuracy

## Output Format
```json
{
  "analysisTitle": "Comprehensive Data Analysis",
  "dataProfile": {
    "observations": 1000,
    "variables": 15,
    "completeness": "95%",
    "timeframe": "Jan 2024 - Present",
    "dataTypes": {
      "numerical": 8,
      "categorical": 4,
      "temporal": 3
    }
  },
  "descriptiveStats": {
    "centralTendency": {
      "mean": 45.6,
      "median": 42.3,
      "mode": 41.0,
      "interpretation": "Slightly right-skewed distribution"
    },
    "dispersion": {
      "range": "12.5 - 89.2",
      "variance": 156.8,
      "stdDev": 12.52,
      "iqr": 18.7,
      "interpretation": "Moderate variability"
    },
    "distribution": {
      "shape": "Approximately normal with slight positive skew",
      "skewness": 0.34,
      "kurtosis": 2.89,
      "normalityTest": "Fail to reject normality (p > 0.05)"
    }
  },
  "patternAnalysis": {
    "trends": [
      {
        "pattern": "Steady upward trend in Q1-Q3",
        "strength": "Strong",
        "significance": "p < 0.01",
        "businessImpact": "Revenue growth opportunity"
      },
      {
        "pattern": "Weekly cyclical pattern",
        "strength": "Moderate",
        "significance": "p < 0.05",
        "businessImpact": "Resource planning implications"
      }
    ],
    "seasonality": {
      "detected": true,
      "pattern": "Q4 peak, Q2 trough",
      "strength": "Strong seasonal component"
    },
    "anomalies": [
      {
        "date": "2024-03-15",
        "value": 156.7,
        "expected": 45.2,
        "zScore": 8.9,
        "potentialCause": "System error or special event"
      }
    ],
    "correlations": [
      {
        "variables": ["metric_a", "metric_b"],
        "correlation": 0.87,
        "significance": "p < 0.001",
        "interpretation": "Strong positive relationship"
      }
    ]
  },
  "statisticalTests": {
    "significance": [
      {
        "test": "ANOVA",
        "result": "F(3, 996) = 12.45",
        "pValue": 0.00001,
        "interpretation": "Significant differences between groups"
      }
    ],
    "hypothesis": [
      {
        "hypothesis": "Mean > 40",
        "testStatistic": "t = 3.21",
        "pValue": 0.001,
        "conclusion": "Reject null hypothesis"
      }
    ]
  },
  "insights": [
    {
      "insight": "Strong positive correlation between user engagement and revenue",
      "impact": "High",
      "confidence": 0.95,
      "evidence": ["r = 0.87, p < 0.001"],
      "businessValue": "Focus on engagement to drive revenue growth"
    },
    {
      "insight": "Seasonal pattern indicates Q4 opportunity",
      "impact": "Medium",
      "confidence": 0.88,
      "evidence": ["Consistent Q4 peaks over 3 years"],
      "businessValue": "Increase Q4 marketing and inventory"
    }
  ],
  "recommendations": [
    {
      "recommendation": "Implement engagement-focused growth initiatives",
      "priority": "High",
      "effort": "Medium",
      "expectedOutcome": "15-20% revenue increase",
      "timeline": "3-6 months"
    },
    {
      "recommendation": "Prepare for Q4 seasonal demand",
      "priority": "Medium",
      "effort": "Low",
      "expectedOutcome": "Optimized inventory and staffing",
      "timeline": "2-3 months"
    }
  ],
  "visualizations": [
    {
      "type": "line",
      "title": "Trend Analysis Over Time",
      "description": "Shows main metrics with trend lines",
      "axes": ["Time", "Value"],
      "highlights": ["Anomaly detection", "Trend lines"]
    },
    {
      "type": "scatter",
      "title": "Correlation Analysis",
      "description": "Relationship between key variables",
      "axes": ["Metric A", "Metric B"],
      "highlights": ["Correlation coefficient", "Confidence interval"]
    },
    {
      "type": "box",
      "title": "Distribution Analysis",
      "description": "Statistical distribution with outliers",
      "axes": ["Category", "Value"],
      "highlights": ["Median", "Quartiles", "Outliers"]
    },
    {
      "type": "heatmap",
      "title": "Correlation Matrix",
      "description": "All variable correlations",
      "axes": ["Variable 1", "Variable 2"],
      "highlights": ["Strong correlations", "Clusters"]
    }
  ],
  "limitations": [
    "Analysis based on available data timeframe",
    "Assumes data quality is representative",
    "Correlation does not imply causation",
    "Seasonal patterns may change over time"
  ],
  "nextSteps": [
    "Collect additional data to strengthen analysis",
    "Implement recommended visualizations",
    "Monitor for pattern changes",
    "Conduct deeper analysis on high-impact insights"
  ]
}
```
