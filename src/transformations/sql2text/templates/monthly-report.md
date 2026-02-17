# Monthly Report Template

## Overview
Comprehensive monthly data report for stakeholders with trend analysis and business insights.

## Sections
1. **Executive Summary**: High-level overview for leadership
2. **Key Metrics**: KPIs with month-over-month comparisons
3. **Trend Analysis**: Detailed trend identification and analysis
4. **Statistical Deep Dive**: Comprehensive statistical breakdown
5. **Quality Assessment**: Data quality and completeness evaluation
6. **Notable Events**: Significant occurrences or anomalies
7. **Recommendations**: Specific actions for next month

## Metrics Included
- Performance indicators
- Growth metrics
- Quality measures
- Efficiency ratios
- Comparative analysis (MoM, YoY)

## Output Format
```json
{
  "title": "Monthly Report - [Month Year]",
  "executiveSummary": "Overview paragraph",
  "keyMetrics": {
    "metric1": {
      "value": 123,
      "change": "+5.2%",
      "trend": "up",
      "target": 150,
      "achievement": "82%"
    },
    "metric2": {
      "value": 456,
      "change": "-2.1%",
      "trend": "down",
      "target": 500,
      "achievement": "91%"
    }
  },
  "trendAnalysis": {
    "overall": "Positive growth with some areas of concern",
    "growthTrends": ["Revenue up 5.2%", "Users up 8.1%"],
    "concernTrends": ["Costs up 2.1%", "Churn rate stable"],
    "seasonalPatterns": "Q4 historically strongest period"
  },
  "statisticalSummary": {
    "dataPoints": 1000,
    "completeness": "95%",
    "accuracy": "98.5%",
    "outliers": 12,
    "distribution": "Normal with slight positive skew"
  },
  "qualityAssessment": {
    "overallGrade": "B+",
    "completeness": "95%",
    "consistency": "97%",
    "timeliness": "99%",
    "issues": ["Missing data in 5% of records", "Inconsistent date formats"]
  },
  "notableEvents": [
    {
      "date": "2024-01-15",
      "event": "System outage affected metrics",
      "impact": "Medium",
      "resolution": "Fixed within 2 hours"
    }
  ],
  "recommendations": [
    {
      "priority": "High",
      "action": "Address data quality issues",
      "owner": "Data Engineering Team",
      "timeline": "2 weeks",
      "expectedImpact": "Improved accuracy to 99%+"
    },
    {
      "priority": "Medium",
      "action": "Investigate cost increase trend",
      "owner": "Finance Team",
      "timeline": "1 month",
      "expectedImpact": "Cost optimization opportunities"
    }
  ],
  "nextSteps": [
    "Implement data quality improvements",
    "Conduct cost analysis review",
    "Prepare Q2 forecast based on trends"
  ]
}
```
