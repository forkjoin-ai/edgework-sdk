/**
 * AI prompt templates for text-to-SQL transformation with statistical context
 */

import { QueryOptions, StatisticalContext } from '../common-types';
import { ContextBuilder } from '../statistical/context-builder';

export class QueryPromptBuilder {
  /**
   * Build text-to-SQL prompt with dash schema context
   */
  static buildTextToSQLPrompt(
    input: string,
    statisticalContext: StatisticalContext,
    options: QueryOptions
  ): string {
    const basePrompt = `You are an expert SQL generator for the Dash SQLite database system. Your task is to convert unstructured text into valid SQLite SQL statements.

## Dash Schema Context

The following tables are available in the Dash database:

### Core Tables
1. **dash_meta** - Key-value metadata storage
   - key (TEXT PRIMARY KEY)
   - value (TEXT)

2. **dash_sync_queue** - Change tracking for sync
   - id (INTEGER PRIMARY KEY AUTOINCREMENT)
   - table_name (TEXT NOT NULL)
   - row_id (TEXT NOT NULL)
   - operation (TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')))
   - data (TEXT)
   - created_at (INTEGER DEFAULT (strftime('%s', 'now') * 1000))
   - synced (INTEGER DEFAULT 0)

3. **dash_vectors** - Vector embeddings for semantic search
   - id (TEXT PRIMARY KEY)
   - content (TEXT NOT NULL)
   - embedding (BLOB)
   - metadata (TEXT)
   - created_at (INTEGER DEFAULT (strftime('%s', 'now') * 1000))

4. **dash_yjs_state** - Yjs document state for CRDT sync
   - doc_id (TEXT PRIMARY KEY)
   - state (BLOB NOT NULL)
   - updated_at (INTEGER DEFAULT (strftime('%s', 'now') * 1000))

5. **dash_benchmarks** - Performance metrics
   - id (TEXT PRIMARY KEY)
   - name (TEXT NOT NULL)
   - operation (TEXT NOT NULL)
   - ops_per_sec (REAL NOT NULL)
   - avg_latency_ms (REAL NOT NULL)
   - min_latency_ms (REAL NOT NULL)
   - max_latency_ms (REAL NOT NULL)
   - total_ops (INTEGER NOT NULL)
   - total_time_ms (REAL NOT NULL)
   - created_at (INTEGER NOT NULL)
   - metadata (TEXT)

6. **dash_ucans** - Authentication tokens
   - id (TEXT PRIMARY KEY)
   - token (TEXT NOT NULL)
   - issuer (TEXT NOT NULL)
   - audience (TEXT NOT NULL)
   - capabilities (TEXT NOT NULL)
   - expires_at (INTEGER NOT NULL)
   - created_at (INTEGER DEFAULT (strftime('%s', 'now') * 1000))

## Task Requirements

1. **Analyze the input text** and understand the data structure
2. **Generate appropriate SQL** that matches the dash schema
3. **Use statistical insights** to optimize data types and table selection
4. **Follow SQLite syntax** and best practices
5. **Handle edge cases** like missing values, duplicates, and data validation

## Output Format

Return a JSON response with this structure:
\`\`\`json
{
  "sql": "GENERATED_SQL_STATEMENT",
  "table": "TABLE_NAME",
  "columns": [
    {
      "name": "column_name",
      "type": "TEXT|INTEGER|REAL|BLOB",
      "nullable": true,
      "primaryKey": false
    }
  ],
  "confidence": 0.95,
  "warnings": ["any warnings or concerns"]
}
\`\`\`

## Guidelines

- **Prefer existing dash tables** when the data matches their purpose
- **Create new tables** only when data doesn't fit existing schema
- **Use appropriate data types** based on statistical analysis
- **Include constraints** and indexes where appropriate
- **Handle timestamps** using Unix milliseconds (dash standard)
- **Validate data quality** and suggest improvements
- **Consider relationships** between tables

## Input Data

${input}

${
  options.table
    ? `\n## Target Table\n\nUse the specified table: ${options.table}`
    : ''
}

${
  options.createTable
    ? '\n## Table Creation\n\nCreate a new table if needed based on the data structure.'
    : ''
}

${
  options.analyze
    ? '\n## Statistical Analysis Required\n\nPerform deep statistical analysis before generating SQL.'
    : ''
}`;

    return ContextBuilder.buildPrompt(
      basePrompt,
      [input],
      statisticalContext,
      'text2sql'
    );
  }

  /**
   * Build specialized prompt for different input types
   */
  static buildSpecializedPrompt(
    input: string,
    inputType: 'json' | 'csv' | 'text',
    statisticalContext: StatisticalContext,
    options: QueryOptions
  ): string {
    switch (inputType) {
      case 'json':
        return this.buildJsonToSQLPrompt(input, statisticalContext, options);
      case 'csv':
        return this.buildCsvToSQLPrompt(input, statisticalContext, options);
      default:
        return this.buildTextToSQLPrompt(input, statisticalContext, options);
    }
  }

  /**
   * Build JSON-to-SQL prompt
   */
  private static buildJsonToSQLPrompt(
    input: string,
    statisticalContext: StatisticalContext,
    options: QueryOptions
  ): string {
    const basePrompt = `You are converting JSON data to SQLite SQL statements for the Dash database.

## JSON Structure Analysis
Analyze the provided JSON structure to understand:
- Nested objects and relationships
- Data types and constraints
- Array structures and how to normalize them
- Primary key candidates

## Conversion Strategy
1. **Normalize nested objects** into related tables
2. **Handle arrays** with junction tables or JSON storage
3. **Preserve relationships** using foreign keys
4. **Optimize for SQLite** performance

## Input JSON
\`\`\`json
${input}
\`\`\`

${options.table ? `## Target Table: ${options.table}` : ''}

Generate appropriate CREATE TABLE and INSERT statements.`;

    return ContextBuilder.buildPrompt(
      basePrompt,
      JSON.parse(input || '[]'),
      statisticalContext,
      'text2sql'
    );
  }

  /**
   * Build CSV-to-SQL prompt
   */
  private static buildCsvToSQLPrompt(
    input: string,
    statisticalContext: StatisticalContext,
    options: QueryOptions
  ): string {
    const basePrompt = `You are converting CSV data to SQLite SQL statements for the Dash database.

## CSV Analysis Requirements
1. **Detect headers** and infer column names
2. **Analyze data types** from sample rows
3. **Handle special cases** like quoted fields, escaped commas
4. **Determine table structure** based on content

## Statistical Context for Type Inference
Use the statistical analysis to optimize data type selection:
- **Numerical data**: Choose INTEGER vs REAL based on decimal presence
- **Text data**: Consider length limits and indexing needs
- **Mixed types**: Use TEXT with validation or separate columns

## Input CSV
\`\`\`csv
${input}
\`\`\`

${options.table ? `## Target Table: ${options.table}` : ''}

Generate CREATE TABLE statement and INSERT statements for all rows.`;

    // Parse CSV for statistical analysis
    const lines = input.split('\n').filter((line) => line.trim());
    const headers =
      lines[0]?.split(',').map((h) => h.trim().replace(/"/g, '')) || [];
    const dataRows = lines
      .slice(1)
      .map((line) =>
        line.split(',').map((cell) => cell.trim().replace(/"/g, ''))
      );

    return ContextBuilder.buildPrompt(
      basePrompt,
      dataRows,
      statisticalContext,
      'text2sql'
    );
  }

  /**
   * Build validation prompt for outlier detection
   */
  static buildValidationPrompt(
    sql: string,
    statisticalContext: StatisticalContext
  ): string {
    return `You are validating SQL statements for the Dash SQLite database.

## Generated SQL
\`\`\`sql
${sql}
\`\`\`

## Statistical Context
${ContextBuilder.buildTextToSQLContext([], statisticalContext)}

## Validation Checklist
1. **Syntax Validation**: Check for SQL syntax errors
2. **Schema Compliance**: Ensure compatibility with dash tables
3. **Data Type Appropriateness**: Verify types match statistical analysis
4. **Performance Considerations**: Check for potential optimization issues
5. **Security**: Prevent SQL injection vulnerabilities

## Output
Return a JSON response:
\`\`\`json
{
  "valid": true/false,
  "errors": ["error messages"],
  "warnings": ["warnings"],
  "suggestions": ["improvement suggestions"]
}
\`\`\``;
  }

  /**
   * Build prompt for data type recommendations
   */
  static buildTypeRecommendationPrompt(
    data: any[],
    statisticalContext: StatisticalContext
  ): string {
    return `You are recommending optimal SQLite data types based on statistical analysis.

## Statistical Analysis Results
${ContextBuilder.buildTextToSQLContext(data, statisticalContext)}

## Data Type Guidelines
- **INTEGER**: Whole numbers, IDs, counts, timestamps (Unix ms)
- **REAL**: Decimal numbers, measurements, percentages
- **TEXT**: Strings, names, descriptions, JSON objects
- **BLOB**: Binary data, large objects, compressed data

## Recommendations Required
For each field in the data, recommend:
1. **Primary data type** with justification
2. **Constraints** (NOT NULL, UNIQUE, DEFAULT)
3. **Indexes** if frequently queried
4. **Relationships** if foreign keys are needed

Output format:
\`\`\`json
{
  "recommendations": {
    "field_name": {
      "type": "TEXT|INTEGER|REAL|BLOB",
      "justification": "reasoning",
      "constraints": ["NOT NULL", "UNIQUE"],
      "indexed": true,
      "relationship": "foreign_key_reference"
    }
  }
}
\`\`\``;
  }
}
