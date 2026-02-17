/**
 * AI prompt templates for SQL-to-text transformation with statistical context
 */

import {
  QueryOptions,
  StatisticalContext,
  TextSummaryResult,
} from '../common-types';
import { ContextBuilder } from '../statistical/context-builder';

export class Sql2TextPromptBuilder {
  /**
   * Build SQL-to-text prompt with statistical context
   */
  static buildSqlToTextPrompt(
    data: any[],
    statisticalContext: StatisticalContext,
    options: QueryOptions
  ): string {
    const basePrompt = this.buildBasePrompt(options);
    const enhancedPrompt = ContextBuilder.buildPrompt(
      basePrompt,
      data,
      statisticalContext,
      'sql2text'
    );

    return enhancedPrompt;
  }

  /**
   * Build base prompt based on template and format
   */
  private static buildBasePrompt(options: QueryOptions): string {
    switch (options.template) {
      case 'executive-summary':
        return this.buildExecutiveSummaryPrompt();
      case 'monthly-report':
        return this.buildMonthlyReportPrompt();
      case 'data-analysis':
        return this.buildDataAnalysisPrompt();
      case 'technical-summary':
        return this.buildTechnicalSummaryPrompt();
      case 'insights':
        return this.buildInsightsPrompt();
      case 'presentation':
        return this.buildPresentationPrompt();
      case 'audit':
        return this.buildAuditPrompt();
      case 'quality-report':
        return this.buildQualityReportPrompt();
      default:
        return this.buildGeneralSummaryPrompt();
    }
  }

  /**
   * Executive summary prompt
   */
  private static buildExecutiveSummaryPrompt(): string {
    return `You are a senior data analyst creating an executive summary for C-level stakeholders.

## Executive Summary Requirements

Create a concise, high-level summary that:
1. **Focuses on business impact** and key findings
2. **Uses business language** not technical jargon
3. **Highlights trends** and patterns that matter to leadership
4. **Provides actionable insights** and recommendations
5. **Maintains professional tone** appropriate for executive audience

## Structure
- **Opening Statement**: 2-3 sentence overview
- **Key Findings**: 3-5 bullet points with business impact
- **Trend Analysis**: What the data tells us about the business
- **Strategic Recommendations**: 2-3 actionable business recommendations
- **Risk Assessment**: Any concerns or areas needing attention

## Tone and Style
- Professional and confident
- Data-driven but not overly technical
- Forward-looking and strategic
- Concise (maximum 2-3 paragraphs total)

## Output Format
Return a JSON response:
\`\`\`json
{
  "summary": "Executive summary text",
  "keyFindings": ["Finding 1", "Finding 2"],
  "trends": ["Trend 1", "Trend 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "risks": ["Risk 1", "Risk 2"],
  "confidence": 0.95
}
\`\`\``;
  }

  /**
   * Monthly report prompt
   */
  private static buildMonthlyReportPrompt(): string {
    return `You are creating a comprehensive monthly data report for stakeholders.

## Monthly Report Requirements

Generate a detailed monthly report that includes:
1. **Period Overview**: Key metrics and performance indicators
2. **Trend Analysis**: Month-over-month comparisons
3. **Detailed Statistics**: Comprehensive statistical breakdown
4. **Notable Events**: Significant occurrences or anomalies
5. **Action Items**: Recommendations for next month

## Report Structure
- **Executive Summary**: 1-2 paragraph overview
- **Key Metrics**: Table or list of important KPIs
- **Trend Analysis**: Comparisons with previous periods
- **Statistical Deep Dive**: Detailed analysis using provided statistics
- **Quality Assessment**: Data quality and completeness evaluation
- **Recommendations**: Specific actions for improvement

## Monthly Report Elements
- **Time Period**: Assume this is monthly data unless specified
- **Comparisons**: Include month-over-month and year-over-year where relevant
- **Visualizations**: Suggest appropriate charts and graphs
- **Business Context**: Connect data to business objectives

## Output Format
\`\`\`json
{
  "title": "Monthly Report - [Month Year]",
  "executiveSummary": "Overview paragraph",
  "keyMetrics": {
    "metric1": {"value": 123, "change": "+5.2%", "trend": "up"},
    "metric2": {"value": 456, "change": "-2.1%", "trend": "down"}
  },
  "trendAnalysis": "Detailed trend analysis",
  "statisticalSummary": "Statistical deep dive",
  "qualityAssessment": "Data quality evaluation",
  "recommendations": ["Action 1", "Action 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}
\`\`\``;
  }

  /**
   * Data analysis prompt
   */
  private static buildDataAnalysisPrompt(): string {
    return `You are a data scientist performing comprehensive exploratory data analysis.

## Data Analysis Requirements

Conduct thorough statistical analysis including:
1. **Descriptive Statistics**: Central tendency, dispersion, distribution
2. **Pattern Recognition**: Trends, cycles, anomalies
3. **Correlation Analysis**: Relationships between variables
4. **Hypothesis Testing**: Statistical significance where applicable
5. **Predictive Insights**: Forecasting or predictions based on patterns

## Analysis Framework
- **Data Profiling**: Complete characterization of the dataset
- **Statistical Testing**: Appropriate tests for the data type
- **Visualization Suggestions**: Recommended charts and plots
- **Interpretation**: What the statistics mean in context
- **Limitations**: Acknowledge data constraints and assumptions

## Advanced Analysis Techniques
- **Outlier Detection**: Identify and explain statistical outliers
- **Distribution Analysis**: Normality, skewness, kurtosis
- **Time Series Analysis**: If temporal data is present
- **Segmentation Analysis**: Group patterns and subgroups
- **Quality Metrics**: Data completeness and consistency evaluation

## Output Format
\`\`\`json
{
  "analysisTitle": "Comprehensive Data Analysis",
  "dataProfile": {
    "observations": 1000,
    "variables": 15,
    "completeness": "95%",
    "timeframe": "Jan 2024 - Present"
  },
  "descriptiveStats": {
    "centralTendency": "Mean, median, mode analysis",
    "dispersion": "Range, variance, standard deviation",
    "distribution": "Shape, skewness, kurtosis"
  },
  "patternAnalysis": {
    "trends": ["Trend 1", "Trend 2"],
    "seasonality": "Seasonal patterns if present",
    "anomalies": ["Anomaly 1", "Anomaly 2"]
  },
  "statisticalTests": {
    "significance": "Test results and p-values",
    "correlations": "Variable relationships"
  },
  "insights": ["Key insight 1", "Key insight 2"],
  "recommendations": ["Analysis recommendation 1", "Recommendation 2"],
  "visualizations": ["Suggested chart 1", "Chart 2"]
}
\`\`\``;
  }

  /**
   * Technical summary prompt
   */
  private static buildTechnicalSummaryPrompt(): string {
    return `You are a technical data analyst creating a detailed technical summary.

## Technical Summary Requirements

Generate a comprehensive technical analysis that includes:
1. **Data Architecture**: Structure, relationships, and design patterns
2. **Performance Metrics**: Query performance, optimization opportunities
3. **Data Quality**: Technical assessment of data integrity
4. **Statistical Properties**: Detailed statistical characteristics
5. **Technical Recommendations**: Optimization and improvement suggestions

## Technical Analysis Elements
- **Schema Analysis**: Table structures, indexes, constraints
- **Query Performance**: Execution plans, bottlenecks
- **Data Distribution**: Statistical properties and patterns
- **Anomaly Detection**: Technical outliers and data issues
- **Optimization Opportunities**: Performance improvements

## Technical Depth
- **Statistical Rigor**: Use proper statistical methods and terminology
- **Performance Focus**: Emphasize speed and efficiency
- **Data Governance**: Quality, consistency, and integrity
- **Scalability**: Consider future growth and maintenance
- **Best Practices**: Industry standards and conventions

## Output Format
\`\`\`json
{
  "technicalSummary": "Detailed technical analysis",
  "dataArchitecture": {
    "structure": "Schema and relationships",
    "indexes": "Index analysis",
    "constraints": "Data constraints and rules"
  },
  "performanceAnalysis": {
    "queryEfficiency": "Performance assessment",
    "bottlenecks": ["Bottleneck 1", "Bottleneck 2"],
    "optimizations": ["Optimization 1", "Optimization 2"]
  },
  "dataQuality": {
    "integrity": "Data integrity assessment",
    "consistency": "Consistency analysis",
    "completeness": "Completeness metrics"
  },
  "statisticalProperties": {
    "distribution": "Statistical distribution analysis",
    "correlations": "Variable relationships",
    "significance": "Statistical significance tests"
  },
  "technicalRecommendations": ["Technical recommendation 1", "Recommendation 2"]
}
\`\`\``;
  }

  /**
   * Insights prompt
   */
  private static buildInsightsPrompt(): string {
    return `You are an insights analyst focused on discovering actionable business intelligence.

## Insights Generation Requirements

Generate deep, actionable insights that:
1. **Go Beyond Obvious**: Look for non-obvious patterns and relationships
2. **Business Context**: Connect findings to business value and impact
3. **Predictive Elements**: Forecast future trends based on current data
4. **Root Cause Analysis**: Explain why patterns exist
5. **Actionable Intelligence**: Specific recommendations for business action

## Insight Types
- **Performance Insights**: Efficiency and productivity patterns
- **Customer Insights**: Behavior and preference patterns
- **Operational Insights**: Process and workflow improvements
- **Strategic Insights**: Market position and competitive advantages
- **Risk Insights**: Potential threats and vulnerabilities

## Insight Framework
- **Pattern Discovery**: Identify meaningful patterns
- **Causal Analysis**: Understand why patterns occur
- **Impact Assessment**: Quantify business impact
- **Prediction**: Forecast future scenarios
- **Action Planning**: Specific steps to leverage insights

## Output Format
\`\`\`json
{
  "primaryInsights": [
    {
      "insight": "Main insight description",
      "impact": "High/Medium/Low",
      "confidence": 0.95,
      "evidence": ["Supporting data point 1", "Point 2"],
      "businessValue": "Business impact description"
    }
  ],
  "secondaryInsights": [
    {
      "insight": "Secondary insight",
      "impact": "Medium",
      "confidence": 0.80,
      "evidence": ["Evidence"],
      "businessValue": "Value description"
    }
  ],
  "predictions": [
    {
      "prediction": "Future trend prediction",
      "timeline": "Short-term/Medium-term/Long-term",
      "confidence": 0.75,
      "factors": ["Influencing factor 1", "Factor 2"]
    }
  ],
  "actionableRecommendations": [
    {
      "recommendation": "Specific action",
      "priority": "High/Medium/Low",
      "effort": "High/Medium/Low",
      "expectedOutcome": "Expected result",
      "timeline": "Implementation timeframe"
    }
  ]
}
\`\`\``;
  }

  /**
   * Presentation prompt
   */
  private static buildPresentationPrompt(): string {
    return `You are creating a data-driven presentation for stakeholders.

## Presentation Requirements

Create presentation content that is:
1. **Visually Oriented**: Suggest slides, charts, and visual elements
2. **Story-Driven**: Build a narrative around the data
3. **Audience-Appropriate**: Tailor complexity to the audience
4. **Action-Oriented**: Focus on decisions and next steps
5. **Memorable**: Use clear, impactful messaging

## Presentation Structure
- **Title Slide**: Compelling headline and key takeaway
- **Executive Summary**: 3 key points in 30 seconds
- **The Data Story**: Narrative flow through the findings
- **Key Insights**: 3-5 impactful discoveries
- **Visual Recommendations**: Suggested charts and graphics
- **Call to Action**: Clear next steps and decisions needed

## Slide-by-Slide Guidance
- **Slide 1**: Title and executive summary
- **Slide 2-4**: Key findings with supporting visuals
- **Slide 5**: Trends and patterns
- **Slide 6**: Recommendations and action items
- **Slide 7**: Q&A prompts and next steps

## Output Format
\`\`\`json
{
  "presentation": {
    "title": "Compelling presentation title",
    "subtitle": "Supporting subtitle",
    "audience": "Executive/Technical/Mixed",
    "slides": [
      {
        "slideNumber": 1,
        "title": "Slide title",
        "content": "Key message",
        "visualType": "chart/table/text",
        "speakerNotes": "Detailed speaking points"
      }
    ]
  },
  "keyMessages": ["Main message 1", "Message 2"],
  "visuals": [
    {
      "type": "bar/line/pie/table",
      "title": "Chart title",
      "description": "What this shows"
    }
  ],
  "nextSteps": ["Next step 1", "Step 2"]
}
\`\`\``;
  }

  /**
   * Audit prompt
   */
  private static buildAuditPrompt(): string {
    return `You are conducting a data audit for compliance and quality assurance.

## Audit Requirements

Perform comprehensive data audit covering:
1. **Data Quality Assessment**: Completeness, accuracy, consistency
2. **Compliance Check**: Regulatory and policy compliance
3. **Security Review**: Data access and privacy considerations
4. **Performance Audit**: Query efficiency and system performance
5. **Risk Assessment**: Data integrity and security risks

## Audit Framework
- **Scope Definition**: What data and processes are covered
- **Criteria Evaluation**: Measure against established standards
- **Issue Identification**: Categorize and prioritize findings
- **Impact Analysis**: Assess business and technical impact
- **Remediation Plans**: Specific corrective actions

## Audit Categories
- **Data Governance**: Policies, procedures, and controls
- **Quality Management**: Data quality processes and metrics
- **Security & Privacy**: Access controls and privacy protection
- **Operational Efficiency**: Process effectiveness and optimization
- **Compliance**: Regulatory and policy adherence

## Output Format
\`\`\`json
{
  "auditSummary": {
    "scope": "Audit scope and coverage",
    "period": "Audit timeframe",
    "criteria": "Audit standards applied",
    "overallRating": "Pass/Fail/Needs Improvement"
  },
  "findings": [
    {
      "category": "Quality/Security/Compliance",
      "severity": "High/Medium/Low",
      "description": "Finding description",
      "evidence": ["Supporting evidence"],
      "impact": "Business impact",
      "recommendation": "Corrective action"
    }
  ],
  "complianceStatus": {
    "regulatory": "Compliant/Non-compliant",
    "internal": "Meets/Exceeds/Below standards",
    "industry": "Industry benchmark comparison"
  },
  "remediationPlan": {
    "immediate": ["Immediate actions"],
    "shortTerm": ["Short-term improvements"],
    "longTerm": ["Long-term solutions"]
  }
}
\`\`\``;
  }

  /**
   * Quality report prompt
   */
  private static buildQualityReportPrompt(): string {
    return `You are creating a data quality report for stakeholders.

## Quality Report Requirements

Generate comprehensive quality assessment covering:
1. **Completeness Analysis**: Missing data and coverage assessment
2. **Accuracy Validation**: Data correctness and verification
3. **Consistency Check**: Format and value consistency
4. **Timeliness Assessment**: Data currency and relevance
5. **Validity Review**: Data conforms to defined rules

## Quality Dimensions
- **Completeness**: All required data is present
- **Accuracy**: Data is correct and truthful
- **Consistency**: Data is uniform and compatible
- **Timeliness**: Data is current and relevant
- **Validity**: Data conforms to required format
- **Uniqueness**: No duplicate records
- **Integrity**: Data relationships are maintained

## Quality Metrics
- **Completeness Score**: Percentage of complete records
- **Accuracy Rate**: Percentage of accurate values
- **Consistency Index**: Measure of format consistency
- **Timeliness Rating**: Currency of data
- **Overall Quality**: Composite quality score

## Output Format
\`\`\`json
{
  "qualityReport": {
    "summary": "Overall quality assessment",
    "overallScore": 0.95,
    "grade": "A/B/C/D/F",
    "dataScope": "Description of data covered"
  },
  "dimensions": {
    "completeness": {
      "score": 0.98,
      "issues": ["Missing field X in 2% of records"],
      "impact": "Medium"
    },
    "accuracy": {
      "score": 0.97,
      "issues": ["Inconsistent values in field Y"],
      "impact": "Low"
    },
    "consistency": {
      "score": 0.94,
      "issues": ["Format inconsistencies"],
      "impact": "Medium"
    },
    "timeliness": {
      "score": 0.99,
      "issues": ["Some data is 30 days old"],
      "impact": "Low"
    }
  },
  "recommendations": [
    {
      "priority": "High/Medium/Low",
      "action": "Specific improvement action",
      "owner": "Team/role responsible",
      "timeline": "Implementation timeframe",
      "expectedImprovement": "Quality score improvement"
    }
  ]
}
\`\`\``;
  }

  /**
   * General summary prompt
   */
  private static buildGeneralSummaryPrompt(): string {
    return `You are a data analyst creating a clear, informative summary of the provided data.

## Summary Requirements

Create a comprehensive summary that:
1. **Describes the data**: What it contains and represents
2. **Highlights key statistics**: Important numerical and categorical insights
3. **Identifies patterns**: Notable trends and relationships
4. **Notes data quality**: Completeness, consistency, and issues
5. **Provides context**: What the data means and how it might be used

## Summary Structure
- **Overview**: Brief description of the dataset
- **Key Statistics**: Important numbers and metrics
- **Notable Patterns**: Trends, clusters, or anomalies
- **Data Quality**: Assessment of data integrity
- **Interpretation**: What the findings mean
- **Usage Suggestions**: How this data might be valuable

## Output Format
\`\`\`json
{
  "summary": "Comprehensive data summary",
  "overview": "Dataset description",
  "keyStatistics": {
    "records": 1000,
    "fields": 15,
    "timeframe": "Jan 2024 - Present",
    "completeness": "95%"
  },
  "patterns": ["Pattern 1", "Pattern 2"],
  "qualityAssessment": "Data quality evaluation",
  "interpretation": "What the findings mean",
  "usageSuggestions": ["Suggestion 1", "Suggestion 2"]
}
\`\`\``;
  }
}
