# Technical Summary Template

## Overview
Detailed technical analysis for engineering and data science teams with focus on performance, architecture, and optimization.

## Technical Areas
1. **Data Architecture**: Structure, relationships, design patterns
2. **Performance Metrics**: Query performance, bottlenecks, optimization
3. **Data Quality**: Technical assessment of integrity and consistency
4. **Statistical Properties**: Detailed statistical characteristics
5. **Technical Recommendations**: Specific optimization suggestions

## Analysis Depth
- **Statistical Rigor**: Proper statistical methods and terminology
- **Performance Focus**: Emphasis on speed, efficiency, scalability
- **Data Governance**: Quality, consistency, integrity assessment
- **Best Practices**: Industry standards and conventions
- **Technical Debt**: Identification of improvement areas

## Technical Metrics
- **Schema Efficiency**: Normalization, indexing, constraints
- **Query Performance**: Execution plans, optimization opportunities
- **Data Distribution**: Statistical properties and patterns
- **System Health**: Error rates, response times, resource usage

## Output Format
```json
{
  "technicalSummary": "Comprehensive technical analysis of data architecture and performance",
  "dataArchitecture": {
    "structure": {
      "tables": 5,
      "relationships": 3,
      "normalization": "Third Normal Form (3NF)",
      "indexingStrategy": "Composite indexes on foreign keys and frequently queried columns"
    },
    "schema": {
      "primaryKeys": ["id", "uuid"],
      "foreignKeys": ["user_id", "order_id"],
      "constraints": ["NOT NULL", "UNIQUE", "CHECK"],
      "dataTypes": {
        "optimal": "85%",
        "underutilized": "TEXT for numeric data",
        "recommendations": ["Convert to INTEGER/REAL where appropriate"]
      }
    },
    "relationships": {
      "oneToMany": ["users -> orders", "categories -> products"],
      "manyToMany": ["orders <-> products"],
      "referentialIntegrity": "99.2%",
      "cascadeRules": ["DELETE CASCADE", "UPDATE CASCADE"]
    }
  },
  "performanceAnalysis": {
    "queryEfficiency": {
      "averageExecutionTime": "45ms",
      "slowQueries": 12,
      "optimizationPotential": "High"
    },
    "bottlenecks": [
      {
        "type": "Full Table Scan",
        "table": "order_items",
        "frequency": "High",
        "impact": "Severe",
        "solution": "Add composite index on (order_id, product_id)"
      },
      {
        "type": "Missing Index",
        "table": "users",
        "column": "email",
        "frequency": "Medium",
        "impact": "Moderate",
        "solution": "Add unique index on email column"
      }
    ],
    "optimizations": [
      {
        "area": "Indexing",
        "recommendation": "Add covering index for frequent query patterns",
        "expectedImprovement": "60-80% faster queries",
        "implementation": "CREATE INDEX idx_covering ON table(col1, col2, col3)"
      },
      {
        "area": "Query Rewrite",
        "recommendation": "Replace subquery with JOIN",
        "expectedImprovement": "40-50% faster execution",
        "implementation": "Rewrite SELECT with explicit JOIN syntax"
      }
    ],
    "resourceUtilization": {
      "cpu": "45%",
      "memory": "67%",
      "io": "23%",
      "connections": "125/200"
    }
  },
  "dataQuality": {
    "integrity": {
      "referentialIntegrity": "99.2%",
      "constraintViolations": 8,
      "orphanedRecords": 23
    },
    "consistency": {
      "formatConsistency": "96.8%",
      "valueConsistency": "94.1%",
      "standardDeviations": ["Date formats", "Case sensitivity"]
    },
    "completeness": {
      "nullValues": "2.3%",
      "missingRequiredFields": "1.1%",
      "dataGaps": "Temporal gaps in user activity logs"
    },
    "accuracy": {
      "validationErrors": "0.8%",
      "outOfRangeValues": "0.3%",
      "duplicates": "1.2%"
    }
  },
  "statisticalProperties": {
    "distribution": {
      "normality": "Most variables approximately normal",
      "skewness": {
        "overall": "Slight positive skew",
        "problematic": ["response_time", "file_size"]
      },
      "kurtosis": {
        "overall": "Mesokurtic to leptokurtic",
        "heavyTailed": ["error_rates", "processing_times"]
      }
    },
    "correlations": {
      "strong": [
        {"variables": ["user_activity", "revenue"], "correlation": 0.87},
        {"variables": ["page_views", "conversion"], "correlation": 0.72}
      ],
      "moderate": [
        {"variables": ["session_duration", "return_rate"], "correlation": -0.45}
      ],
      "unexpected": [
        {"variables": ["server_load", "user_satisfaction"], "correlation": 0.12}
      ]
    },
    "timeSeries": {
      "stationarity": "Most series non-stationary",
      "seasonality": "Strong weekly patterns detected",
      "trends": ["Upward trend in user growth", "Downward trend in error rates"]
    }
  },
  "technicalRecommendations": [
    {
      "category": "Schema Optimization",
      "priority": "High",
      "recommendation": "Normalize denormalized user preference data",
      "implementation": "Create separate tables with foreign key relationships",
      "expectedBenefit": "Reduced data redundancy, improved query performance",
      "effort": "Medium",
      "timeline": "2-3 weeks"
    },
    {
      "category": "Indexing Strategy",
      "priority": "High",
      "recommendation": "Implement composite covering indexes for top 10 queries",
      "implementation": "Analyze query patterns, create optimal indexes",
      "expectedBenefit": "60-80% improvement in query performance",
      "effort": "Low",
      "timeline": "1 week"
    },
    {
      "category": "Query Optimization",
      "priority": "Medium",
      "recommendation": "Replace N+1 queries with set-based operations",
      "implementation": "Rewrite application queries using JOIN syntax",
      "expectedBenefit": "Eliminated cursor operations, 40% performance gain",
      "effort": "Medium",
      "timeline": "3-4 weeks"
    },
    {
      "category": "Data Quality",
      "priority": "Medium",
      "recommendation": "Implement data validation constraints",
      "implementation": "Add CHECK constraints and triggers",
      "expectedBenefit": "Improved data integrity, reduced error rates",
      "effort": "Low",
      "timeline": "1-2 weeks"
    }
  ],
  "monitoring": {
    "keyMetrics": [
      "Query execution time",
      "Index usage statistics",
      "Table growth rates",
      "Error rates by type"
    ],
    "alerts": [
      "Slow query threshold (>100ms)",
      "Index fragmentation >30%",
      "Referential integrity violations",
      "Unusual data growth patterns"
    ],
    "dashboards": [
      "Query performance dashboard",
      "Data quality monitoring",
      "Schema change tracking"
    ]
  },
  "implementation": {
    "immediate": [
      "Add missing indexes",
      "Fix constraint violations",
      "Implement query monitoring"
    ],
    "shortTerm": [
      "Schema normalization project",
      "Query optimization initiative",
      "Data quality improvement program"
    ],
    "longTerm": [
      "Performance testing framework",
      "Automated optimization recommendations",
      "Advanced analytics infrastructure"
    ]
  }
}
```
